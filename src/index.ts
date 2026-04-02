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

// ── Unit Tests ──────────────────────────────────────────────────
const unitFiles = await discoverFiles(TARGET_REPO);
console.log(`\n🔍 Found ${unitFiles.length} source files for unit tests:`);
unitFiles.forEach(f => console.log(`  - ${f}`));

console.log("\n📝 Generating unit tests...");
for (const file of unitFiles) {
  console.log(`  Generating test for: ${file}`);
  const res = await unitGenerator.generate(`
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

// ── Integration Tests ───────────────────────────────────────────
const integrationFiles = await discoverIntegrationFiles(TARGET_REPO);
console.log(`\n🔍 Found ${integrationFiles.length} files for integration tests:`);
integrationFiles.forEach(f => console.log(`  - ${f}`));

if (integrationFiles.length > 0) {
  console.log("\n📝 Generating integration tests...");
  for (const file of integrationFiles) {
    console.log(`  Generating integration test for: ${file}`);
    const res = await integrationGenerator.generate(`
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
    `);
    console.log(`  ✓ ${res.text.slice(0, 100)}`);
  }
}

// ── E2E Tests ───────────────────────────────────────────────────
const e2eFiles = await discoverE2EFiles(TARGET_REPO);
console.log(`\n🔍 Found ${e2eFiles.length} files for E2E tests:`);
e2eFiles.forEach(f => console.log(`  - ${f}`));

if (e2eFiles.length > 0) {
  console.log("\n📝 Generating E2E tests...");
  for (const file of e2eFiles) {
    console.log(`  Generating E2E test for: ${file}`);
    const res = await e2eGenerator.generate(`
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
    `);
    console.log(`  ✓ ${res.text.slice(0, 100)}`);
  }
}

// ── Run + fix loop for all test types ───────────────────────────
async function runTestFixLoop(testDir: string, label: string) {
  console.log(`\n🧪 Running ${label} test-fix loop...`);

  for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
    console.log(`\n  Iteration ${iteration}: Running ${label} tests...`);

    const testFiles = await discoverTestFiles(TARGET_REPO, testDir);
    if (testFiles.length === 0) {
      console.log(`  No ${label} test files found. Skipping.`);
      return { status: "no_tests", iterations: 0 };
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
      console.log(`\n  ✅ All ${label} tests passed on iteration ${iteration}!`);
      return { status: "passed", iterations: iteration };
    }

    if (iteration === MAX_ITERATIONS) {
      console.log(`\n  ⚠️  Max iterations reached for ${label} tests.`);
      return { status: "max_iterations", iterations: iteration };
    }

    console.log(`\n  🔧 Iteration ${iteration}: Fixing ${label} failures...`);
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

  return { status: "completed", iterations: MAX_ITERATIONS };
}

const unitResult = await runTestFixLoop("src/__tests__", "unit");
const integrationResult = await runTestFixLoop("tests/integration", "integration");
const e2eResult = await runTestFixLoop("tests/e2e", "E2E");

console.log("\n🏁 Done.");
console.log(`   Unit tests: ${unitResult.status} (${unitResult.iterations} iterations)`);
console.log(`   Integration tests: ${integrationResult.status} (${integrationResult.iterations} iterations)`);
console.log(`   E2E tests: ${e2eResult.status} (${e2eResult.iterations} iterations)`);

process.exit(0);
