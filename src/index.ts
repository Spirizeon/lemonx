import "dotenv/config";
import { mastra } from "./mastra";
import { readdir, readFile } from "fs/promises";
import { join } from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const VERBOSE = process.env.VERBOSE !== "false" && process.env.VERBOSE !== "0";
const DEBUG = process.env.DEBUG === "true" || process.env.DEBUG === "1";
const LOG_PREFIX = "[LEMON]";

function logVerbose(...args: Parameters<typeof console.log>) {
  if (DEBUG) {
    const timestamp = new Date().toISOString();
    console.log(`${LOG_PREFIX} [${timestamp}]`, ...args);
  }
}

function logStep(step: string, details?: string) {
  const timestamp = new Date().toISOString();
  console.log(`${LOG_PREFIX} [${timestamp}] 📍 STEP: ${step}`);
  if (details) {
    console.log(`${LOG_PREFIX} [${timestamp}]    Details: ${details}`);
  }
}

function logAgent(agentName: string, action: string, prompt: string) {
  const timestamp = new Date().toISOString();
  console.log(`${LOG_PREFIX} [${timestamp}] 🤖 AGENT: ${agentName} | ACTION: ${action}`);
  console.log(`${LOG_PREFIX} [${timestamp}]    Prompt Length: ${prompt.length} chars`);
  console.log(`${LOG_PREFIX} [${timestamp}]    Full Prompt:\n${prompt}\n${"-".repeat(80)}`);
}

function logResponse(agentName: string, response: string, truncated?: boolean) {
  const timestamp = new Date().toISOString();
  console.log(`${LOG_PREFIX} [${timestamp}] 📤 RESPONSE from ${agentName}:`);
  console.log(response);
  if (truncated) {
    console.log(`${LOG_PREFIX} [${timestamp}]    [Response truncated - full length: ${response.length} chars]`);
  }
}

function logTool(toolName: string, input: Record<string, unknown>) {
  const timestamp = new Date().toISOString();
  console.log(`${LOG_PREFIX} [${timestamp}] 🔧 TOOL CALL: ${toolName}`);
  console.log(`${LOG_PREFIX} [${timestamp}]    Input: ${JSON.stringify(input, null, 2)}`);
}

function logTestResult(testFile: string, passed: boolean, output: string, failures?: { testName: string; error: string }[]) {
  const timestamp = new Date().toISOString();
  const status = passed ? "✅ PASSED" : "❌ FAILED";
  console.log(`${LOG_PREFIX} [${timestamp}] 🧪 TEST RESULT: ${testFile} | ${status}`);
  console.log(`${LOG_PREFIX} [${timestamp}]    Full Output:\n${output}\n${"-".repeat(80)}`);
  if (failures && failures.length > 0) {
    console.log(`${LOG_PREFIX} [${timestamp}]    Failures:`);
    failures.forEach((f, i) => {
      console.log(`${LOG_PREFIX} [${timestamp}]      [${i + 1}] ${f.testName}: ${f.error}`);
    });
  }
}

const TARGET_REPO = process.env.TARGET_REPO ?? process.cwd();
const LEMON_WORKSPACE = process.env.LEMON_WORKSPACE ?? "/workspace";
const MAX_ITERATIONS = 5;
const GITHUB_TOKEN = process.env.LEMONX ?? process.env.GITHUB_TOKEN ?? "";
const GITHUB_REPOSITORY = process.env.GITHUB_REPOSITORY ?? "";
const GITHUB_REF = process.env.GITHUB_REF ?? "";
const GITHUB_SHA = process.env.GITHUB_SHA ?? "";
const PR_BRANCH = `lemon/test-fix-${Date.now()}`;

function checkRequiredEnvVars() {
  const missing: string[] = [];
  
  if (!process.env.CLOUDFLARE_ACCOUNT_ID) missing.push("CLOUDFLARE_ACCOUNT_ID");
  if (!process.env.CLOUDFLARE_API_KEY) missing.push("CLOUDFLARE_API_KEY");
  
  const hasGitHubToken = process.env.LEMONX || process.env.GITHUB_TOKEN;
  if (!hasGitHubToken) {
    missing.push("LEMONX (GitHub PAT)");
  }
  
  if (missing.length > 0) {
    console.log(`\n${LOG_PREFIX} ⚠️  Missing required repository secrets:`);
    missing.forEach(v => console.log(`   - ${v}`));
    console.log(`\n${LOG_PREFIX} Add secrets at: Settings → Secrets and variables → Actions`);
    console.log(`   - CLOUDFLARE_ACCOUNT_ID`);
    console.log(`   - CLOUDFLARE_API_KEY`);
    console.log(`   - LEMONX (Personal Access Token with 'repo' scope)\n`);
  }
}

checkRequiredEnvVars();

async function getChangedFiles(repoPath: string): Promise<string[]> {
  try {
    const { stdout } = await execAsync("git diff --name-only HEAD", { cwd: repoPath });
    return stdout.trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

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

async function discoverIntegrationFiles(repoPath: string) {
  const entries = await readdir(repoPath, { recursive: true }) as string[];
  return entries
    .filter(f =>
      (f.endsWith(".ts") || f.endsWith(".js")) &&
      !f.includes("node_modules") &&
      !f.includes("__tests__") &&
      !f.includes(".d.ts") &&
      (f.includes("routes") || f.includes("api") || f.includes("service") || f.includes("controller") || f.includes("middleware") || f.includes("handler"))
    )
    .slice(0, 5);
}

async function discoverE2EFiles(repoPath: string) {
  const entries = await readdir(repoPath, { recursive: true }) as string[];
  return entries
    .filter(f =>
      (f.endsWith(".ts") || f.endsWith(".js")) &&
      !f.includes("node_modules") &&
      !f.includes("__tests__") &&
      !f.includes(".d.ts") &&
      (f.includes("app") || f.includes("server") || f.includes("index") || f.includes("routes") || f.includes("auth"))
    )
    .slice(0, 3);
}

async function discoverTestFiles(repoPath: string, testDir: string) {
  try {
    const entries = await readdir(join(repoPath, testDir), { recursive: true }) as string[];
    return entries
      .filter(f => f.endsWith(".test.ts") || f.endsWith(".test.js"))
      .map(f => `${testDir}/${f}`);
  } catch {
    return [];
  }
}

const unitGenerator = mastra.getAgent("testGeneratorAgent");
const integrationGenerator = mastra.getAgent("integrationGeneratorAgent");
const e2eGenerator = mastra.getAgent("e2eGeneratorAgent");
const executor = mastra.getAgent("executorAgent");
const editor = mastra.getAgent("editorAgent");

const generatedFiles: { path: string; content: string }[] = [];

// ── Unit Tests ──────────────────────────────────────────────────
const unitFiles = await discoverFiles(TARGET_REPO);
logStep("DISCOVERY", `Found ${unitFiles.length} source files for unit tests`);
if (DEBUG) {
  unitFiles.forEach(f => logVerbose(`  - ${f}`));
}

console.log(`\n${LOG_PREFIX} 📝 Generating unit tests...`);
for (const file of unitFiles) {
  logStep("TEST_GENERATION", `Generating unit test for: ${file}`);
  
  const prompt = `
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
  `;
  
  logAgent("testGeneratorAgent", "GENERATE_UNIT_TEST", prompt);
  
  const res = await unitGenerator.generate(prompt);
  
  logResponse("testGeneratorAgent", res.text, true);
  
  console.log(`${LOG_PREFIX}  ✓ Test generated for: ${file}`);
}

// ── Integration Tests ───────────────────────────────────────────
const integrationFiles = await discoverIntegrationFiles(TARGET_REPO);
logStep("DISCOVERY", `Found ${integrationFiles.length} files for integration tests`);
if (DEBUG) {
  integrationFiles.forEach(f => logVerbose(`  - ${f}`));
}

if (integrationFiles.length > 0) {
  console.log(`\n${LOG_PREFIX} 📝 Generating integration tests...`);
  for (const file of integrationFiles) {
    logStep("TEST_GENERATION", `Generating integration test for: ${file}`);
    
    const prompt = `
      Do the following steps in order:
      1. Call fetch-analysis with filePath="${file}" to get the stored analysis context.
      2. Call read-file with path="${file}" to read the source code.
      3. Write a comprehensive vitest integration test file for this source file.
      4. Call write-file with:
         - path="tests/integration/${file.replace(/^src\//, "").replace(/\.ts$/, ".test.ts")}"
         - content = the full test file you wrote
      5. Call store-tests with:
         - filePath="${file}"
         - testFilePath="tests/integration/${file.replace(/^src\//, "").replace(/\.ts$/, ".test.ts")}"
         - testCode = the full test file content
      Do all 5 steps now.
    `;
    
    logAgent("integrationGeneratorAgent", "GENERATE_INTEGRATION_TEST", prompt);
    
    const res = await integrationGenerator.generate(prompt);
    
    logResponse("integrationGeneratorAgent", res.text, true);
    
    console.log(`${LOG_PREFIX}  ✓ Integration test generated for: ${file}`);
  }
}

// ── E2E Tests ───────────────────────────────────────────────────
const e2eFiles = await discoverE2EFiles(TARGET_REPO);
logStep("DISCOVERY", `Found ${e2eFiles.length} files for E2E tests`);
if (DEBUG) {
  e2eFiles.forEach(f => logVerbose(`  - ${f}`));
}

if (e2eFiles.length > 0) {
  console.log(`\n${LOG_PREFIX} 📝 Generating E2E tests...`);
  for (const file of e2eFiles) {
    logStep("TEST_GENERATION", `Generating E2E test for: ${file}`);
    
    const prompt = `
      Do the following steps in order:
      1. Call fetch-analysis with filePath="${file}" to get the stored analysis context.
      2. Call read-file with path="${file}" to read the source code.
      3. Write a comprehensive vitest E2E test file for this source file.
      4. Call write-file with:
         - path="tests/e2e/${file.replace(/^src\//, "").replace(/\.ts$/, ".test.ts")}"
         - content = the full test file you wrote
      5. Call store-tests with:
         - filePath="${file}"
         - testFilePath="tests/e2e/${file.replace(/^src\//, "").replace(/\.ts$/, ".test.ts")}"
         - testCode = the full test file content
      Do all 5 steps now.
    `;
    
    logAgent("e2eGeneratorAgent", "GENERATE_E2E_TEST", prompt);
    
    const res = await e2eGenerator.generate(prompt);
    
    logResponse("e2eGeneratorAgent", res.text, true);
    
    console.log(`${LOG_PREFIX}  ✓ E2E test generated for: ${file}`);
  }
}

// ── Run + fix loop for all test types ───────────────────────────
async function runTestFixLoop(testDir: string, label: string) {
  logStep("TEST_FIX_LOOP_START", `${label} tests | max iterations: ${MAX_ITERATIONS}`);

  for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
    logStep(`ITERATION_${iteration}`, `Running ${label} tests...`);

    const testFiles = await discoverTestFiles(TARGET_REPO, testDir);
    if (testFiles.length === 0) {
      logStep("DISCOVERY", `No ${label} test files found. Skipping.`);
      return { status: "no_tests", iterations: 0, changedFiles: [] };
    }

    logVerbose(`Discovered ${testFiles.length} test files:`, testFiles);

    let allPassed = true;
    for (const testFile of testFiles) {
      console.log(`${LOG_PREFIX} 🧪 Executing: ${testFile}`);
      
      const prompt = `
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
      `;
      
      logAgent("executorAgent", "RUN_TESTS", prompt);
      
      const res = await executor.generate(prompt);
      
      const passed = !res.text.toLowerCase().includes("fail") && !res.text.toLowerCase().includes("error");
      logTestResult(testFile, passed, res.text);
      
      if (!passed) {
        allPassed = false;
      }
    }

    if (allPassed) {
      logStep("ALL_TESTS_PASSED", `All ${label} tests passed on iteration ${iteration}!`);
      return { status: "passed", iterations: iteration, changedFiles: await getChangedFiles(TARGET_REPO) };
    }

    if (iteration === MAX_ITERATIONS) {
      logStep("MAX_ITERATIONS_REACHED", `Max iterations reached for ${label} tests.`);
      return { status: "max_iterations", iterations: iteration, changedFiles: await getChangedFiles(TARGET_REPO) };
    }

    logStep(`FIXING_ITERATION_${iteration}`, `Fixing ${label} failures...`);
    
    const fixPrompt = `
      Do the following steps in order:
      1. Call fetch-results with iteration=${iteration} to get failing tests.
      2. For each failing test, call read-file on the source file being tested.
      3. For each failing test, fix the source file and call write-file to save it with:
         - patchDescription = a short description of what you fixed
         - iteration = ${iteration}
      Do all steps now.
    `;
    
    logAgent("editorAgent", "APPLY_FIXES", fixPrompt);
    
    const results = await editor.generate(fixPrompt);
    
    logResponse("editorAgent", results.text, true);
    
    logVerbose(`Editor applied fixes for iteration ${iteration}`);
  }

  return { status: "completed", iterations: MAX_ITERATIONS, changedFiles: await getChangedFiles(TARGET_REPO) };
}

const unitResult = await runTestFixLoop("src/__tests__", "unit");
const integrationResult = await runTestFixLoop("tests/integration", "integration");
const e2eResult = await runTestFixLoop("tests/e2e", "E2E");

console.log("\n🏁 Done.");
console.log(`   Unit tests: ${unitResult.status} (${unitResult.iterations} iterations)`);
console.log(`   Integration tests: ${integrationResult.status} (${integrationResult.iterations} iterations)`);
console.log(`   E2E tests: ${e2eResult.status} (${e2eResult.iterations} iterations)`);

// ── GitHub API Helper Functions ──────────────────────────────────────
async function getBaseBranchSha(owner: string, repo: string, branch: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/branches/${branch}`,
      {
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: "application/vnd.github+json",
        },
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.commit.sha;
  } catch {
    return null;
  }
}

async function createBranch(owner: string, repo: string, branch: string, baseSha: string): Promise<void> {
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/refs`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ref: `refs/heads/${branch}`,
        sha: baseSha,
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to create branch ${branch}: ${err}`);
  }
}

async function getFileSha(owner: string, repo: string, path: string, branch: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`,
      {
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: "application/vnd.github+json",
        },
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.sha;
  } catch {
    return null;
  }
}

async function uploadFileToGitHub(
  owner: string,
  repo: string,
  filePath: string,
  content: string,
  branch: string
): Promise<void> {
  const sha = await getFileSha(owner, repo, filePath, branch);

  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: `🍋 lemon: generated ${filePath}`,
        content: Buffer.from(content).toString("base64"),
        branch,
        sha: sha ?? undefined,
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to upload ${filePath}: ${err}`);
  }
}

async function collectGeneratedFiles(): Promise<{ path: string; content: string }[]> {
  const files: { path: string; content: string }[] = [];
  const dirs = ["src/__tests__", "tests/integration", "tests/e2e"];

  for (const dir of dirs) {
    try {
      const entries = await readdir(join(TARGET_REPO, dir), { recursive: true }) as string[];
      for (const entry of entries) {
        if (entry.endsWith(".test.ts") || entry.endsWith(".test.js")) {
          const fullPath = join(TARGET_REPO, dir, entry);
          const content = await readFile(fullPath, "utf-8");
          files.push({ path: `${dir}/${entry}`, content });
        }
      }
    } catch {
      // Directory doesn't exist, skip
    }
  }

  return files;
}

// ── PR Creation ──────────────────────────────────────────────────
async function createPR(): Promise<string | null> {
  if (!GITHUB_TOKEN || !GITHUB_REPOSITORY) {
    console.log("  ⚠️  GITHUB_TOKEN or GITHUB_REPOSITORY not set — skipping PR creation");
    return null;
  }

  const [owner, repo] = GITHUB_REPOSITORY.split("/");
  const baseBranch = GITHUB_REF.replace("refs/heads/", "").replace("refs/pull/", "").replace("/merge", "");

  const prTitle = `🍋 lemon: auto-generated tests + fixes for ${baseBranch}`;
  const changedFiles = [
    ...(unitResult.changedFiles || []),
    ...(integrationResult.changedFiles || []),
    ...(e2eResult.changedFiles || []),
  ];

  const prBody = `## 🍋 lemon — AI Test Report

**Branch:** ${baseBranch}
**Commit:** ${GITHUB_SHA.slice(0, 7)}

### Test Results
| Test Type | Status | Iterations |
|---|---|---|
| Unit | ${unitResult.status} | ${unitResult.iterations} |
| Integration | ${integrationResult.status} | ${integrationResult.iterations} |
| E2E | ${e2eResult.status} | ${e2eResult.iterations} |

### What changed
- Generated vitest unit, integration, and E2E tests for source files
- Ran tests and collected pass/fail results
- Applied code fixes to make tests pass

### Changed files
${changedFiles.length > 0 ? changedFiles.map((f: string) => `- \`${f}\``).join("\n") : "No files changed"}
`;

  try {
    const files = await collectGeneratedFiles();
    if (files.length === 0) {
      console.log("  ℹ️  No generated test files found — skipping PR creation");
      return null;
    }

    const baseSha = await getBaseBranchSha(owner, repo, baseBranch);
    if (!baseSha) {
      console.log("  ❌ Could not get base branch SHA");
      return null;
    }

    await createBranch(owner, repo, PR_BRANCH, baseSha);
    console.log(`  🌿 Created branch: ${PR_BRANCH}`);

    console.log(`  📤 Uploading ${files.length} files to GitHub...`);
    for (const file of files) {
      await uploadFileToGitHub(owner, repo, file.path, file.content, PR_BRANCH);
      console.log(`    ✓ ${file.path}`);
    }

    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({
        title: prTitle,
        body: prBody,
        head: PR_BRANCH,
        base: baseBranch,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.log(`  ❌ Failed to open PR: ${err}`);
      return null;
    }

    const data = await res.json();
    console.log(`  ✅ PR created: ${data.html_url}`);
    return data.html_url;
  } catch (err: any) {
    console.log(`  ❌ PR creation failed: ${err.message}`);
    return null;
  }
}

const prUrl = await createPR();
if (prUrl) {
  console.log(`\n🎉 Pull request opened: ${prUrl}`);
}

process.exit(0);
