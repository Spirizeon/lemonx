import express, { Request, Response } from "express";
import { mastra } from "./mastra/index.js";
import { readdir, readFile, writeFile, mkdir } from "fs/promises";
import { join, dirname } from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const app = express();
app.use(express.json());

const PORT = process.env.WEBHOOK_PORT ?? 3456;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET ?? "";
const MAX_ITERATIONS = 5;

// ── Webhook signature verification ──────────────────────────────
async function verifySignature(req: Request): Promise<boolean> {
  if (!WEBHOOK_SECRET) return true;
  const sig = req.headers["x-webhook-signature"] as string;
  if (!sig) return false;
  const crypto = await import("crypto");
  const expected = crypto
    .createHmac("sha256", WEBHOOK_SECRET)
    .update(JSON.stringify(req.body))
    .digest("hex");
  return sig === `sha256=${expected}`;
}

// ── Health check ────────────────────────────────────────────────
app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", agents: ["testGeneratorAgent", "executorAgent", "editorAgent"] });
});

// ── Trigger full test-fix loop ──────────────────────────────────
app.post("/webhook/test-and-fix", async (req: Request, res: Response) => {
  if (!(await verifySignature(req))) {
    return res.status(401).json({ error: "Invalid signature" });
  }

  const { repoUrl, branch, commitSha, targetDir } = req.body;

  if (!targetDir) {
    return res.status(400).json({ error: "targetDir is required" });
  }

  console.log(`\n🔔 Webhook received: ${repoUrl}/${branch} (${commitSha?.slice(0, 7) ?? "unknown"})`);
  console.log(`   Target: ${targetDir}`);

  // Respond immediately — process in background
  res.json({ status: "accepted", message: "Test-fix loop started" });

  try {
    const results = await runTestFixLoop(targetDir);
    console.log("\n✅ Test-fix loop completed:", results);
  } catch (err) {
    console.error("\n❌ Test-fix loop failed:", err);
  }
});

// ── Trigger test generation only ────────────────────────────────
app.post("/webhook/generate-tests", async (req: Request, res: Response) => {
  if (!(await verifySignature(req))) {
    return res.status(401).json({ error: "Invalid signature" });
  }

  const { targetDir, files } = req.body;

  if (!targetDir) {
    return res.status(400).json({ error: "targetDir is required" });
  }

  console.log(`\n🔔 Webhook received: generate tests for ${targetDir}`);

  try {
    const sourceFiles = files ?? await discoverFiles(targetDir);
    const generated = [];

    for (const file of sourceFiles) {
      console.log(`  Generating tests for: ${file}`);
      const generator = mastra.getAgent("testGeneratorAgent");
      const testPath = file.replace(/^src\//, "").replace(/\.ts$/, ".test.ts");
      const genRes = await generator.generate(`
        Do the following steps in order:
        1. Call read-file with path="${file}" to read the source code.
        2. Write a comprehensive vitest unit test file for this source file.
        3. Call write-file with:
           - path="src/__tests__/${testPath}"
           - content = the full test file you wrote
        4. Call store-tests with:
           - filePath="${file}"
           - testFilePath="src/__tests__/${testPath}"
           - testCode = the full test file content
        Do all 4 steps now.
      `);
      generated.push({ file, testPath, success: true });
      console.log(`  ✓ ${file} → ${testPath}`);
    }

    return res.json({ status: "done", generated });
  } catch (err: any) {
    console.error("  ✗ Generation failed:", err);
    return res.status(500).json({ error: err.message });
  }
});

// ── Trigger test execution only ─────────────────────────────────
app.post("/webhook/run-tests", async (req: Request, res: Response) => {
  if (!(await verifySignature(req))) {
    return res.status(401).json({ error: "Invalid signature" });
  }

  const { targetDir, testFile } = req.body;

  if (!targetDir) {
    return res.status(400).json({ error: "targetDir is required" });
  }

  try {
    const testFiles = testFile
      ? [testFile]
      : await discoverTestFiles(targetDir);

    if (testFiles.length === 0) {
      return res.json({ status: "done", results: [], message: "No test files found" });
    }

    const results = [];
    for (const tf of testFiles) {
      const executor = mastra.getAgent("executorAgent");
      const execRes = await executor.generate(`
        Do the following steps in order:
        1. Call run-tests with testFilePath="${tf}"
        2. Call store-results with:
           - testId = any unique string
           - filePath = "${tf}"
           - passed = true or false based on run-tests result
           - output = the full output from run-tests
           - failures = array of {testName, error} objects from the run-tests result
           - iteration = 1
        Do both steps now.
      `);
      const passed = !execRes.text.toLowerCase().includes("fail") && !execRes.text.toLowerCase().includes("error");
      results.push({ file: tf, passed, summary: execRes.text.slice(0, 200) });
    }

    return res.json({ status: "done", results });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Helper: discover source files ───────────────────────────────
async function discoverFiles(repoPath: string) {
  const entries = await readdir(repoPath, { recursive: true }) as string[];
  return entries
    .filter(f =>
      (f.endsWith(".ts") || f.endsWith(".js")) &&
      !f.includes("node_modules") &&
      !f.includes("__tests__") &&
      !f.includes(".d.ts") &&
      !f.includes("seeds/") &&
      !f.includes("migrations/") &&
      !f.includes("public/")
    )
    .slice(0, 5);
}

// ── Helper: discover test files ─────────────────────────────────
async function discoverTestFiles(repoPath: string) {
  try {
    const testDir = join(repoPath, "src/__tests__");
    const entries = await readdir(testDir, { recursive: true }) as string[];
    return entries
      .filter(f => f.endsWith(".test.ts") || f.endsWith(".test.js"))
      .map(f => `src/__tests__/${f}`);
  } catch {
    return [];
  }
}

// ── Full test-fix loop ──────────────────────────────────────────
async function runTestFixLoop(targetDir: string) {
  const generator = mastra.getAgent("testGeneratorAgent");
  const executor = mastra.getAgent("executorAgent");
  const editor = mastra.getAgent("editorAgent");

  const files = await discoverFiles(targetDir);
  console.log(`🔍 Found ${files.length} source files`);

  // Step 1: Generate tests
  console.log("📝 Generating tests...");
  for (const file of files) {
    const testPath = file.replace(/^src\//, "").replace(/\.ts$/, ".test.ts");
    await generator.generate(`
      Do the following steps in order:
      1. Call read-file with path="${file}" to read the source code.
      2. Write a comprehensive vitest unit test file for this source file.
      3. Call write-file with:
         - path="src/__tests__/${testPath}"
         - content = the full test file you wrote
      4. Call store-tests with:
         - filePath="${file}"
         - testFilePath="src/__tests__/${testPath}"
         - testCode = the full test file content
      Do all 4 steps now.
    `);
    console.log(`  ✓ ${file}`);
  }

  // Step 2: Run + fix loop
  for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
    console.log(`🧪 Iteration ${iteration}: Running tests...`);

    const testFiles = await discoverTestFiles(targetDir);
    if (testFiles.length === 0) break;

    let allPassed = true;
    for (const testFile of testFiles) {
      const execRes = await executor.generate(`
        Do the following steps in order:
        1. Call run-tests with testFilePath="${testFile}"
        2. Call store-results with:
           - testId = any unique string
           - filePath = "${testFile}"
           - passed = true or false based on run-tests result
           - output = the full output from run-tests
           - failures = array of {testName, error} objects from the run-tests result
           - iteration = ${iteration}
        Do both steps now.
      `);
      console.log(`  ${testFile}: ${execRes.text.slice(0, 80)}`);

      if (execRes.text.toLowerCase().includes("fail") || execRes.text.toLowerCase().includes("error")) {
        allPassed = false;
      }
    }

    if (allPassed) {
      console.log(`✅ All tests passed on iteration ${iteration}`);
      return { status: "passed", iterations: iteration, files: testFiles.length };
    }

    if (iteration === MAX_ITERATIONS) {
      console.log("⚠️ Max iterations reached");
      return { status: "max_iterations", iterations: iteration, files: testFiles.length };
    }

    console.log(`🔧 Iteration ${iteration}: Fixing failures...`);
    const editRes = await editor.generate(`
      Do the following steps in order:
      1. Call fetch-results with iteration=${iteration} to get failing tests.
      2. For each failing test, call read-file on the source file being tested.
      3. For each failing test, fix the source file and call write-file to save it with:
         - patchDescription = a short description of what you fixed
         - iteration = ${iteration}
      Do all steps now.
    `);
    console.log(`  Editor: ${editRes.text.slice(0, 150)}`);
  }

  return { status: "completed", iterations: MAX_ITERATIONS };
}

// ── Start server ────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🍋 lemon.test webhook server running on port ${PORT}`);
  console.log(`   POST /webhook/test-and-fix  — full generate + run + fix loop`);
  console.log(`   POST /webhook/generate-tests — generate tests only`);
  console.log(`   POST /webhook/run-tests      — run tests only`);
  console.log(`   GET  /health                 — health check`);
});
