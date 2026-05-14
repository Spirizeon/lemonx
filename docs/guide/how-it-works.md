# How It Works

lemon.test uses two specialized AI agents orchestrated by a Mastra Workflow in a research → generate → run → fix loop to autonomously create and maintain tests for your codebase.

## The Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│                    lemon.test Pipeline                       │
│                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐   │
│  │   Discover   │───▶│  Research &  │───▶│  Check &    │   │
│  │   Files      │    │  Generate    │    │  Fix Loop   │   │
│  └──────────────┘    └──────────────┘    └──────┬───────┘   │
│                                                  │           │
│                                    ┌─────────────▼─────────┐ │
│                                    │     All Passing?      │ │
│                                    └──────┬──────────┬─────┘ │
│                                       Yes │          │ No    │
│                                           │          │       │
│                                    ┌──────▼──┐  ┌───▼──────┐ │
│                                    │  Create  │  │  Fix     │ │
│                                    │  PR      │  │  Source  │ │
│                                    └─────────┘  └───┬──────┘ │
│                                                     │        │
│                                    ┌────────────────┘        │
│                                    │ (loop up to 5 times)    │
│                                    └─────────────────────────┘
└─────────────────────────────────────────────────────────────┘
```

## How It Works in Detail

### 1. File Discovery

Scans the target repository for `.ts`/`.js` source files, excluding `node_modules`, `__tests__`, `.d.ts`, `seeds/`, `migrations/`, and `public/`. Takes the first 5 files.

Unlike the previous architecture, there is no separate filtering for unit, integration, or E2E targets. The researchTestAgent autonomously determines the appropriate test type from each file's content and role.

### 2. Research and Generate

For each discovered file, `researchTestAgent` handles the entire cycle:

1. Fetches prior code analysis from Redis for context (RAG)
2. Reads the source file
3. Determines the test type (unit, integration, or E2E) based on the file content
4. Writes comprehensive vitest tests to the appropriate directory
5. Runs the tests with vitest
6. Stores both test metadata and results to Redis

### 3. The Check-and-Fix Loop

After all files have been processed, the workflow enters a fix loop:

```
Iteration 1:
  researchTestAgent ran tests and stored results in Redis
  
  If results all pass → proceed to createPR
  If any fail → editorAgent analyzes failures and fixes source code
               researchTestAgent retests the fixed code
               New results stored in Redis
               
Iteration 2:
  Check results from retest
  If all pass → proceed to createPR
  If any fail → editorAgent applies more fixes, researchTestAgent retests
  
...repeats up to MAX_ITERATIONS (5)
```

### 4. Create PR

If all tests pass, the workflow creates a GitHub branch, commits the changes (new tests + any source code fixes), pushes, and opens a pull request.

## How Agents Communicate

All agents communicate through **Redis** as a shared event log:

| Key Pattern | Purpose | Written By | Read By |
|---|---|---|---|
| `code_analysis:*` | Prior code analysis (RAG context) | External | researchTestAgent |
| `test_metadata:*` | Generated test metadata | researchTestAgent | — |
| `test_results:*` | Test execution results | researchTestAgent | editorAgent |
| `code_patches:*` | Applied code fixes | editorAgent (via writeFileTool) | — |

## Execution Modes

### Machine Runner Mode (Recommended)

```
Git Push → CircleCI → Machine Runner → lemon.test → Results → CircleCI
```

- Code runs directly on your infrastructure
- No webhooks, no tunnels
- lemon.test is pre-installed on the runner
- CircleCI assigns jobs to the runner automatically

### Webhook Mode (Legacy)

```
Git Push → CircleCI → Webhook → lemon.test Server → Clone Repo → Run Workflow → Results
```

- Express server receives CircleCI webhooks
- Clones target repo into a temp workspace
- Runs the testFixWorkflow
- Can automatically open GitHub PRs with changes

## Configuration

| Setting | Default | Description |
|---|---|---|
| `MAX_ITERATIONS` | 5 | Maximum fix loop iterations |
| `TARGET_REPO` | `process.cwd()` | Path to the target repository |
| `LEMON_WORKSPACE` | — | Working directory (set by webhook mode) |
| `WEBHOOK_PORT` | 3456 | Port for the webhook server |
