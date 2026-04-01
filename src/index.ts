import "dotenv/config";
import { mastra } from "./mastra";
import { readdir } from "fs/promises";
import { join } from "path";

const TARGET_REPO = process.env.TARGET_REPO ?? process.cwd();
const MAX_ITERATIONS = 5;

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
    // limit to first 5 files to stay within context limits
    .slice(0, 5);
}

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

const generator = mastra.getAgent("testGeneratorAgent");
const executor  = mastra.getAgent("executorAgent");
const editor    = mastra.getAgent("editorAgent");

const files = await discoverFiles(TARGET_REPO);
console.log(`🔍 Found ${files.length} source files to test:`);
files.forEach(f => console.log(`  - ${f}`));

// ── Step 1: Generate tests one file at a time ──────────────────
console.log("\n📝 Generating tests...");
for (const file of files) {
  console.log(`  Generating test for: ${file}`);
  const res = await generator.generate(`
    Do the following steps in order:
    1. Call fetch-analysis with filePath="${file}" to get the stored analysis context.
    2. Call read-file with path="${file}" to read the source code.
    3. Write a comprehensive vitest unit test file for this source file.
    4. Call write-file with:
       - path="src/__tests__/${file.replace(/^src\//, "").replace(/\.ts$/, ".test.ts")}"
       - content = the full test file you wrote
    5. Call store-tests with:
       - filePath="${file}"
       - testFilePath="src/__tests__/${file.replace(/^src\//, "").replace(/\.ts$/, ".test.ts")}"
       - testCode = the full test file content
    Do all 5 steps now.
  `);
  console.log(`  ✓ ${res.text.slice(0, 100)}`);
}

// ── Step 2: Run + fix loop ─────────────────────────────────────
for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
  console.log(`\n🧪 Iteration ${iteration}: Running tests...`);

  const testFiles = await discoverTestFiles(TARGET_REPO);
  if (testFiles.length === 0) {
    console.log("  No test files found. Skipping.");
    break;
  }

  let allPassed = true;
  for (const testFile of testFiles) {
    const res = await executor.generate(`
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
    console.log(`  ${testFile}: ${res.text.slice(0, 80)}`);

    if (res.text.toLowerCase().includes("fail") || res.text.toLowerCase().includes("error")) {
      allPassed = false;
    }
  }

  if (allPassed) {
    console.log(`\n✅ All tests passed on iteration ${iteration}!`);
    break;
  }

  if (iteration === MAX_ITERATIONS) {
    console.log("\n⚠️  Max iterations reached.");
    break;
  }

  console.log(`\n🔧 Iteration ${iteration}: Fixing failures...`);
  const results = await editor.generate(`
    Do the following steps in order:
    1. Call fetch-results with iteration=${iteration} to get failing tests.
    2. For each failing test, call read-file on the source file being tested.
    3. For each failing test, fix the source file and call write-file to save it with:
       - patchDescription = a short description of what you fixed
       - iteration = ${iteration}
    Do all steps now.
  `);
  console.log(`  Editor: ${results.text.slice(0, 150)}`);
}

console.log("\n🏁 Done.");
