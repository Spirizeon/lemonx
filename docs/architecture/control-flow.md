# Control Flow

This document describes the step-by-step execution flow of lemon.test from start to finish.

## High-Level Flow

```
Push → CircleCI → Machine Runner → lemon.test → Results → CircleCI
```

Within lemon.test, the flow is orchestrated by a single Mastra Workflow:

```
testFixWorkflow:
  Step 1: discoverFiles (procedural)
  Step 2: researchAndGenerate (researchTestAgent per file)
  Step 3: loop(checkAndFix) — check results, fix, retest (max 5 iterations)
  Step 4: createPR (procedural)
```

## Detailed Execution Flow

### Step 1: discoverFiles

Scans the target repository for source files. The researchTestAgent autonomously determines test type per file, so discovery is simpler:

1. Recursively scan all `.ts`/`.js` files
2. Exclude: `node_modules`, `__tests__`, `.d.ts`, `seeds/`, `migrations/`, `public/`
3. Take the first 5 files

No separate filtering for unit/integration/E2E targets — the agent determines the appropriate test type from the file's content and role.

### Step 2: researchAndGenerate

For each discovered source file, the workflow calls `researchTestAgent`:

```
For each source file:
  1. researchTestAgent receives prompt with file path
  2. Agent calls fetch-analysis to get RAG context from Redis
  3. Agent calls read-file to get source code
  4. Agent autonomously determines test type (unit/integration/E2E)
  5. Agent writes vitest tests to the appropriate directory
  6. Agent calls run-tests to execute vitest
  7. Agent calls store-tests to persist metadata to Redis
  8. Agent calls store-results to persist test results to Redis
```

The agent handles research, generation, execution, and storage in a single autonomous call.

### Step 3: loop(checkAndFix)

After generation, the workflow enters a fix loop:

```
loop(checkAndFix):
  For iteration = 1 to MAX_ITERATIONS (5):

    Step A: Check Results
      Read test results from Redis for the current iteration
      If all tests passed:
        Exit loop — proceed to createPR
      If iteration == MAX_ITERATIONS:
        Exit loop — report max_iterations

    Step B: Fix Failures
      1. Call editorAgent with iteration number
      2. Agent calls fetch-results to get failing tests
      3. For each failing test:
         a. Agent calls read-file on the source file
         b. Agent analyzes the failure
         c. Agent calls write-file with the fix + patchDescription
      4. Call researchTestAgent again to retest the fixed code
      5. Store new results to Redis
      6. Loop back to Step A
```

### Step 4: createPR

If all tests pass and changes were made:

```
1. Create a new branch
2. Commit all changes (tests + source fixes)
3. Push to GitHub
4. Open a pull request
```

## Webhook Mode Flow

In webhook mode (`src/webhook-server.ts`), the flow is similar but wrapped in HTTP endpoints:

### POST /webhook/test-and-fix

```
1. Verify webhook signature (if secret is configured)
2. Clone target repo to temp workspace
3. Set LEMON_WORKSPACE to the cloned directory
4. Run testFixWorkflow
5. Return results to caller
6. Clean up temp workspace
```

### POST /webhook/generate-tests

```
1. Clone target repo
2. Set LEMON_WORKSPACE
3. Run researchAndGenerate step of testFixWorkflow
4. Return list of generated tests
5. Clean up workspace
```

### POST /webhook/run-tests

```
1. Clone target repo
2. Set LEMON_WORKSPACE
3. Call researchTestAgent for each test file (runs tests only)
4. Return pass/fail results
5. Clean up workspace
```

## Error Handling

- **npm install failures** (webhook mode): Proceeds anyway, logs a warning
- **Git clone failures**: Returns error response immediately
- **Agent failures**: Caught and returned as error responses
- **Max iterations**: Returns `max_iterations` status, not an error
- **No test files**: Returns `no_tests` status, not an error
- **Workspace cleanup**: Always runs in `finally` block, errors silently ignored
