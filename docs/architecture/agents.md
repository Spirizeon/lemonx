# Agents

lemon.test uses two specialized AI agents and one Mastra Workflow built on the Mastra framework. All agents use Cloudflare Workers AI with the model `@cf/meta/llama-3.3-70b-instruct-fp8-fast`.

## researchTestAgent

**Purpose**: Combines research, test generation, and test execution into a single autonomous agent. Given a source file, it researches the code (via RAG analysis), generates appropriate vitest tests, runs them, and stores the results — all in one call.

The agent autonomously determines the test type (unit, integration, or E2E) based on the file's role in the codebase. Files containing route, service, or API patterns get integration/E2E tests; utility and pure logic files get unit tests.

**Tools**:
- `fetchAnalysisTool` — retrieves prior code analysis from Redis (RAG context)
- `storeTestsTool` — persists test metadata to Redis
- `storeResultsTool` — persists test results to Redis
- `readFileTool` — reads the source file content
- `writeFileTool` — saves the generated test file
- `runTestsTool` — executes vitest on a specific test file

**Workflow**:
1. Fetch code analysis from Redis for RAG context
2. Read the source file
3. Determine test type based on file analysis
4. Generate and write tests to the appropriate directory
5. Run the tests with vitest
6. Store test metadata and results to Redis

**Output**: Generated test file + Redis entries for test metadata and results

**Source**: `src/mastra/agents/researchTestAgent.ts`

---

## editorAgent

**Purpose**: Reads failing test results from Redis and applies targeted code fixes to make tests pass. Unchanged from the original architecture.

**Tools**:
- `fetchResultsTool` — retrieves test results from Redis
- `fetchAnalysisTool` — retrieves prior code analysis for context
- `readFileTool` — reads source files that need fixing
- `writeFileTool` — applies fixes (logs patches to Redis)
- `listFilesTool` — lists available source files

**Responsibilities**:
- Fetch the latest test results for the current iteration
- For each failing test, read the relevant source file
- Analyze failure messages to determine the root cause
- Apply the minimal fix needed (surgical changes only)
- Never modify test files — only fix source files
- Report what was changed and why

**Principles**:
- Be surgical — make the smallest change that fixes the failure
- If a fix might break other things, add a comment explaining the tradeoff
- Include a patch description and iteration number with every fix

**Source**: `src/mastra/agents/editorAgent.ts`

---

## testFixWorkflow (Mastra Workflow)

**Purpose**: Orchestrates the full test generation → fix loop using a Mastra Workflow. Replaces the previous manual orchestration in `src/index.ts`.

**Steps**:

1. **discoverFiles** (procedural step) — Scans the target repository for source files. Excludes `node_modules`, `__tests__`, `.d.ts`, `seeds/`, `migrations/`, `public/`. Passes the file list to the next step.

2. **researchAndGenerate** (calls researchTestAgent per file) — For each discovered file, calls `researchTestAgent` which handles research → test generation → test execution → storage to Redis in a single autonomous call.

3. **loop(checkAndFix)** — Reads test results from Redis. If failures exist, calls `editorAgent` to fix the source code, then retests by calling `researchTestAgent` again. Loops until all tests pass or a maximum of 5 iterations is reached.

4. **createPR** (procedural step) — If all tests pass and changes were made, creates a GitHub branch, commits the changes, pushes, and opens a pull request using the GitHub API.

**Source**: `src/mastra/workflows/testFixWorkflow.ts`
