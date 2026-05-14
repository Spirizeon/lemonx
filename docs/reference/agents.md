# Agents API

Reference documentation for all AI agents and the Mastra Workflow in lemon.test.

## Mastra Instance

All agents and the workflow are registered in a single Mastra instance:

```typescript
// src/mastra/index.ts
import { Mastra } from "@mastra/core/mastra";

export const mastra = new Mastra({
  agents: {
    researchTestAgent,
    editorAgent,
  },
  workflows: {
    testFixWorkflow,
  },
});
```

Access agents via:

```typescript
const agent = mastra.getAgent("researchTestAgent");
const result = await agent.generate("your prompt");
```

Run workflows via:

```typescript
const workflow = mastra.getWorkflow("testFixWorkflow");
const { runId, start } = await workflow.execute({
  triggerData: { repoPath: "/path/to/repo" },
});
```

---

## researchTestAgent

| Property | Value |
|---|---|
| **ID** | `researchTestAgent` |
| **Model** | `cloudflare-workers-ai/@cf/meta/llama-3.3-70b-instruct-fp8-fast` |
| **Source** | `src/mastra/agents/researchTestAgent.ts` |

**Tools**: `fetchAnalysisTool`, `storeTestsTool`, `storeResultsTool`, `readFileTool`, `writeFileTool`, `runTestsTool`

**Instructions Summary**: Autonomous test engineer that researches source code via RAG analysis, determines the appropriate test type (unit/integration/E2E) from file content, generates comprehensive vitest tests, runs them, and stores results to Redis — all in a single call.

---

## editorAgent

| Property | Value |
|---|---|
| **ID** | `editorAgent` |
| **Model** | `cloudflare-workers-ai/@cf/meta/llama-3.3-70b-instruct-fp8-fast` |
| **Source** | `src/mastra/agents/editorAgent.ts` |

**Tools**: `fetchResultsTool`, `fetchAnalysisTool`, `readFileTool`, `writeFileTool`, `listFilesTool`

**Instructions Summary**: Senior code editor and debugger. Reads failing test results from Redis, analyzes failure messages, and applies minimal surgical fixes to source files only (never modifies test files).

---

## testFixWorkflow

| Property | Value |
|---|---|
| **ID** | `testFixWorkflow` |
| **Source** | `src/mastra/workflows/testFixWorkflow.ts` |

A Mastra Workflow that orchestrates the full test generation → fix → PR pipeline.

### Steps

| Step | Type | Description |
|---|---|---|
| `discoverFiles` | Procedural | Scans target repo for `.ts`/`.js` source files |
| `researchAndGenerate` | Agent call | Calls `researchTestAgent` per file (research → gen → run → store) |
| `loop(checkAndFix)` | Loop (max 5) | Reads Redis results, calls `editorAgent` on failures, retests |
| `createPR` | Procedural | Commits changes and opens a GitHub pull request |

### Execution

```typescript
const workflow = mastra.getWorkflow("testFixWorkflow");
const { runId, start } = await workflow.execute({
  triggerData: {
    repoPath: "/path/to/repo",        // required: path to target repository
    githubToken: process.env.GITHUB_TOKEN, // optional: for PR creation
    maxIterations: 5,                     // optional: default 5
  },
});
```
