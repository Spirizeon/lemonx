import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";
import { readdir, readFile } from "fs/promises";
import { join } from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { randomUUID } from "crypto";
import { getRedisClient } from "../../redis/client";

const execAsync = promisify(exec);
const MAX_ITERATIONS = 5;

const LOG_PREFIX = "[WORKFLOW]";
function log(msg: string) {
  const ts = new Date().toISOString();
  console.log(`${LOG_PREFIX} [${ts}] ${msg}`);
}

async function discoverSourceFiles(repoPath: string): Promise<string[]> {
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

async function discoverTestFiles(repoPath: string): Promise<string[]> {
  const dirs = ["src/__tests__", "tests/integration", "tests/e2e"];
  const testFiles: string[] = [];
  for (const dir of dirs) {
    try {
      const entries = await readdir(join(repoPath, dir), { recursive: true }) as string[];
      for (const entry of entries) {
        if (entry.endsWith(".test.ts") || entry.endsWith(".test.js")) {
          testFiles.push(`${dir}/${entry}`);
        }
      }
    } catch { /* skip */ }
  }
  return testFiles;
}

async function collectGeneratedFiles(repoPath: string): Promise<{ path: string; content: string }[]> {
  const files: { path: string; content: string }[] = [];
  const dirs = ["src/__tests__", "tests/integration", "tests/e2e"];
  for (const dir of dirs) {
    try {
      const entries = await readdir(join(repoPath, dir), { recursive: true }) as string[];
      for (const entry of entries) {
        if (entry.endsWith(".test.ts") || entry.endsWith(".test.js")) {
          const fullPath = join(repoPath, dir, entry);
          const content = await readFile(fullPath, "utf-8");
          files.push({ path: `${dir}/${entry}`, content });
        }
      }
    } catch { /* skip */ }
  }
  return files;
}

const FAILURE_PATTERN = /✗\s+(.+)\n[\s\S]*?Error:\s+(.+)/g;
function parseFailures(output: string) {
  const failures: { testName: string; error: string }[] = [];
  let match;
  while ((match = FAILURE_PATTERN.exec(output)) !== null) {
    failures.push({ testName: match[1].trim(), error: match[2].trim() });
  }
  return failures;
}

async function runTestFile(testFile: string, repoPath: string, iteration: number) {
  const redis = getRedisClient();
  try {
    const { stdout, stderr } = await execAsync(
      `npx vitest run ${testFile} --reporter=verbose`,
      { cwd: repoPath }
    );
    const output = stdout + stderr;
    const passed = !output.includes("FAIL") && !output.includes("failed");
    const failures = parseFailures(output);
    const id = randomUUID();
    await redis.set(`test_results:${id}`, JSON.stringify({
      id, testId: testFile, filePath: testFile, passed, output, failures,
      runAt: new Date().toISOString(), iteration,
    }));
    return { passed, output, failures };
  } catch (err: any) {
    const output = (err.stdout || "") + (err.stderr || "");
    const failures = parseFailures(output);
    const id = randomUUID();
    await redis.set(`test_results:${id}`, JSON.stringify({
      id, testId: testFile, filePath: testFile, passed: false, output, failures,
      runAt: new Date().toISOString(), iteration,
    }));
    return { passed: false, output, failures };
  }
}

// ── Step 1: Discover source files ─────────────────────────────
const discoverFilesStep = createStep({
  id: "discoverFiles",
  description: "Scans the repository for source files that need tests",
  inputSchema: z.object({
    repoPath: z.string(),
    files: z.array(z.string()).optional(),
  }),
  outputSchema: z.object({
    sourceFiles: z.array(z.string()),
  }),
  execute: async ({ inputData }) => {
    log("Discovering source files...");
    const sourceFiles = inputData.files ?? await discoverSourceFiles(inputData.repoPath);
    log(`Found ${sourceFiles.length} source files`);
    return { sourceFiles };
  },
});

// ── Step 2: Research + generate + execute tests ──────────────
const researchAndGenerateStep = createStep({
  id: "researchAndGenerate",
  description: "For each source file, calls the researchTestAgent to research, generate tests, run them, and store results in Redis",
  inputSchema: z.object({
    sourceFiles: z.array(z.string()),
  }),
  outputSchema: z.object({
    testFiles: z.array(z.string()),
  }),
  execute: async ({ inputData, mastra, getInitData }) => {
    const initData = getInitData() as { repoPath: string };
    const agent = mastra?.getAgent("researchTestAgent");
    if (!agent) throw new Error("researchTestAgent not found");

    log(`Generating and running tests for ${inputData.sourceFiles.length} files...`);

    for (const file of inputData.sourceFiles) {
      const testType = (file.includes("routes") || file.includes("api") || file.includes("service") ||
        file.includes("controller") || file.includes("middleware") || file.includes("handler"))
        ? "INTEGRATION"
        : (file.includes("app") || file.includes("server") || file.includes("index") || file.includes("auth"))
        ? "E2E"
        : "UNIT";

      const ext = file.endsWith(".ts") ? ".ts" : ".js";
      const baseName = file.replace(/^src\//, "").replace(/\.(ts|js)$/, "");
      const testDir = testType === "UNIT" ? "src/__tests__"
        : testType === "INTEGRATION" ? "tests/integration"
        : "tests/e2e";

      log(`Processing: ${file} → ${testType} tests`);

      const prompt = `
        Do the following steps in order for file "${file}":

        ## RESEARCH
        1. Call fetch-analysis with filePath="${file}" to get stored analysis context (if any).
        2. Call read-file with path="${file}" to read the source code.

        ## GENERATE ${testType} TESTS
        3. Write comprehensive vitest ${testType.toLowerCase()} tests covering:
           - Happy path (normal expected behavior)
           - Edge cases (empty input, nulls, boundary values)
           - Error cases (exceptions, invalid input)
        4. Call write-file with:
           - path="${testDir}/${baseName}.test${ext}"
           - content = the full test file content
        5. Call store-tests with:
           - filePath="${file}"
           - testFilePath="${testDir}/${baseName}.test${ext}"
           - testCode = the full test file content

        ## EXECUTE
        6. Call run-tests with testFilePath="${testDir}/${baseName}.test${ext}"
        7. Call store-results with:
           - testId = "${file}"
           - filePath = "${testDir}/${baseName}.test${ext}"
           - passed = true or false (from run-tests)
           - output = the full run-tests output
           - failures = the array of failures from run-tests
           - iteration = 1

        Do all 7 steps now.
      `;
      await agent.generate(prompt);
      log(`  Completed: ${file}`);
    }

    const testFiles = await discoverTestFiles(initData.repoPath);
    log(`Generated ${testFiles.length} test files total`);
    return { testFiles };
  },
});

// ── Step 3: Fix + retest loop body ────────────────────────────
const checkAndFixStep = createStep({
  id: "checkAndFix",
  description: "Checks Redis for test results, calls editor agent to fix failures, then retests",
  inputSchema: z.object({
    testFiles: z.array(z.string()),
  }),
  outputSchema: z.object({
    allPassed: z.boolean(),
    iteration: z.number(),
  }),
  execute: async ({ inputData, mastra, getInitData, state, setState }) => {
    const initData = getInitData() as { repoPath: string };
    const redis = getRedisClient();
    const currentIter = (state as any)?.iteration ?? 1;

    log(`Checking results for iteration ${currentIter}...`);

    const keys = await redis.keys("test_results:*");
    const iterationResults: { passed: boolean }[] = [];
    for (const key of keys) {
      const raw = await redis.get(key);
      if (raw) {
        const entry = JSON.parse(raw);
        if (entry.iteration === currentIter) {
          iterationResults.push({ passed: entry.passed });
        }
      }
    }

    const anyResults = iterationResults.length > 0;
    const allPassed = anyResults && iterationResults.every(r => r.passed);
    log(`Iteration ${currentIter}: ${iterationResults.length} test runs, allPassed=${allPassed}`);

    if (allPassed || currentIter >= MAX_ITERATIONS) {
      await setState({ ...(state ?? {}), iteration: currentIter, allPassed });
      return { allPassed, iteration: currentIter };
    }

    // Fix failures via editor agent
    log(`Editor agent fixing failures (iteration ${currentIter})...`);
    const editor = mastra?.getAgent("editorAgent");
    if (editor) {
      await editor.generate(`
        Do the following steps in order:
        1. Call fetch-results with iteration=${currentIter} to get failing tests.
        2. For each failing test, call read-file on the source file being tested.
        3. For each failing test, fix the source file and call write-file to save it with:
           - patchDescription = a short description of what you fixed
           - iteration = ${currentIter}
        Do all steps now.
      `);
    }
    log("Editor fixes applied");

    // Retest all test files
    const nextIter = currentIter + 1;
    log(`Re-running ${inputData.testFiles.length} test files (iteration ${nextIter})...`);
    for (const testFile of inputData.testFiles) {
      const result = await runTestFile(testFile, initData.repoPath, nextIter);
      log(`  ${testFile}: ${result.passed ? "PASSED" : "FAILED"}`);
    }

    await setState({ ...(state ?? {}), iteration: nextIter });
    return { allPassed: false, iteration: nextIter };
  },
});

// ── Step 4: Create GitHub PR ──────────────────────────────────
const createPRStep = createStep({
  id: "createPR",
  description: "Creates a GitHub pull request with the generated tests and fixes",
  inputSchema: z.object({
    allPassed: z.boolean(),
    iteration: z.number(),
  }),
  outputSchema: z.object({
    prUrl: z.string().nullable(),
  }),
  execute: async ({ getInitData, state }) => {
    const initData = getInitData() as {
      repoPath: string;
      githubToken?: string;
      githubRepo?: string;
      githubRef?: string;
      githubSha?: string;
    };
    const st = state as any;
    const finalIteration = st.iteration ?? 0;
    const allPassed = st.allPassed ?? false;
    const status = allPassed ? "passed" : (finalIteration >= MAX_ITERATIONS ? "max_iterations" : "failed");
    log(`Final status: ${status} after ${finalIteration} iterations`);

    const { githubToken, githubRepo, githubRef, githubSha, repoPath } = initData;
    if (!githubToken || !githubRepo) {
      log("GITHUB_TOKEN or GITHUB_REPOSITORY not set — skipping PR");
      return { prUrl: null };
    }

    const [owner, repo] = githubRepo.split("/");
    const baseBranch = (githubRef ?? "").replace("refs/heads/", "").replace("refs/pull/", "").replace("/merge", "");
    if (!baseBranch) {
      log("Could not determine base branch — skipping PR");
      return { prUrl: null };
    }

    const prBranch = `lemon/test-fix-${Date.now()}`;

    const files = await collectGeneratedFiles(repoPath);
    if (files.length === 0) {
      log("No generated test files found — skipping PR");
      return { prUrl: null };
    }

    try {
      const branchRes = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/branches/${baseBranch}`,
        { headers: { Authorization: `Bearer ${githubToken}`, Accept: "application/vnd.github+json" } }
      );
      if (!branchRes.ok) throw new Error("Failed to get base branch");
      const branchData: any = await branchRes.json();
      const baseSha = branchData.commit.sha;

      const createRefRes = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/git/refs`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${githubToken}`,
            Accept: "application/vnd.github+json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ref: `refs/heads/${prBranch}`, sha: baseSha }),
        }
      );
      if (!createRefRes.ok) {
        const err = await createRefRes.text();
        throw new Error(`Failed to create branch: ${err}`);
      }
      log(`Branch created: ${prBranch}`);

      for (const file of files) {
        const shaRes = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/contents/${file.path}?ref=${prBranch}`,
          { headers: { Authorization: `Bearer ${githubToken}`, Accept: "application/vnd.github+json" } }
        );
        const existingSha = shaRes.ok ? (await shaRes.json() as any).sha : undefined;

        const uploadRes = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/contents/${file.path}`,
          {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${githubToken}`,
              Accept: "application/vnd.github+json",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              message: `🍋 lemon: generated ${file.path}`,
              content: Buffer.from(file.content).toString("base64"),
              branch: prBranch,
              sha: existingSha ?? undefined,
            }),
          }
        );
        if (!uploadRes.ok) {
          const err = await uploadRes.text();
          log(`Failed to upload ${file.path}: ${err}`);
        } else {
          log(`  Uploaded: ${file.path}`);
        }
      }

      const prBody = `## 🍋 lemon — AI Test Report

**Branch:** ${baseBranch}
**Commit:** ${(githubSha ?? "").slice(0, 7) || "unknown"}

### Test Results
| Status | Iterations |
|---|---|
| ${status} | ${finalIteration} |

### Changed files
${files.map(f => `- \`${f.path}\``).join("\n")}
`;

      const prRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify({
          title: `🍋 lemon: auto-generated tests + fixes for ${baseBranch}`,
          body: prBody,
          head: prBranch,
          base: baseBranch,
        }),
      });

      if (!prRes.ok) {
        const err = await prRes.text();
        log(`Failed to open PR: ${err}`);
        return { prUrl: null };
      }

      const prData: any = await prRes.json();
      log(`PR created: ${prData.html_url}`);
      return { prUrl: prData.html_url };
    } catch (err: any) {
      log(`PR creation failed: ${err.message}`);
      return { prUrl: null };
    }
  },
});

// ── Workflow composition ──────────────────────────────────────
export const testFixWorkflow = createWorkflow({
  id: "testFixWorkflow",
  inputSchema: z.object({
    repoPath: z.string(),
    githubToken: z.string().optional(),
    githubRepo: z.string().optional(),
    githubRef: z.string().optional(),
    githubSha: z.string().optional(),
    files: z.array(z.string()).optional(),
  }),
  outputSchema: z.object({
    prUrl: z.string().nullable(),
  }),
})
  .then(discoverFilesStep)
  .then(researchAndGenerateStep)
  .dountil(checkAndFixStep, async ({ inputData }) => {
    return inputData.allPassed === true || inputData.iteration >= MAX_ITERATIONS;
  })
  .then(createPRStep)
  .commit();
