# Architecture Overview

lemon.test is a multi-agent AI testing platform built on the Mastra framework. It autonomously generates, executes, and fixes tests for TypeScript/JavaScript codebases.

## System Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        lemon.test                                │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                    Entry Points                             │  │
│  │                                                              │  │
│  │  src/index.ts          src/webhook-server.ts                │  │
│  │  (triggers workflow)   (Express server, legacy mode)         │  │
│  └────────────┬───────────────────────────┬──────────────────┘  │
│               │                           │                      │
│               ▼                           ▼                      │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                 testFixWorkflow (Mastra Workflow)           │  │
│  │                                                              │  │
│  │  discoverFiles → researchAndGenerate → loop(checkAndFix)   │  │
│  │                                             │               │  │
│  │                                     ┌───────▼────────┐      │  │
│  │                                     │  researchTest   │      │  │
│  │                                     │  Agent          │      │  │
│  │                                     └───────┬────────┘      │  │
│  │                                     ┌───────▼────────┐      │  │
│  │                                     │   editorAgent   │      │  │
│  │                                     └────────────────┘      │  │
│  └───────────────────────────┬──────────────────────────────┘  │
│                              │                                  │
│                              ▼                                  │
│  ┌──────────────────────┐  ┌────────────────────────────────┐   │
│  │       Tools           │  │         Redis                  │   │
│  │                        │  │                                │   │
│  │  File I/O:             │  │  code_analysis:*              │   │
│  │  - readFileTool        │  │  test_results:*               │   │
│  │  - writeFileTool       │  │  test_metadata:*              │   │
│  │  - listFilesTool       │  │  code_patches:*               │   │
│  │                        │  │                                │   │
│  │  Runner:               │  │  (shared event log)            │   │
│  │  - runTestsTool        │  │                                │   │
│  │                        │  │                                │   │
│  │  Redis:                │  │                                │   │
│  │  - fetchAnalysisTool   │  │                                │   │
│  │  - fetchResultsTool    │  │                                │   │
│  │  - storeResultsTool    │  │                                │   │
│  │  - storeTestsTool      │  │                                │   │
│  └──────────────────────┘  └────────────────────────────────┘   │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                  External Services                          │  │
│  │                                                              │  │
│  │  Cloudflare Workers AI (Llama 3.3 70B)                      │  │
│  │  CircleCI Machine Runner                                    │  │
│  │  GitHub API (optional PR creation)                          │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

## Core Components

### AI Agents

Two specialized agents powered by Mastra, orchestrated by a Mastra Workflow:

| Agent | Purpose | Model |
|---|---|---|
| `researchTestAgent` | Researches code, generates tests, runs them, stores results (autonomously determines test type) | Cloudflare Workers AI |
| `editorAgent` | Analyzes failures, fixes source code | Cloudflare Workers AI |

### testFixWorkflow

A Mastra Workflow that orchestrates the full pipeline:

1. **discoverFiles** — scans repo for source files
2. **researchAndGenerate** — calls researchTestAgent per file (research → gen tests → run → store)
3. **loop(checkAndFix)** — reads Redis results, calls editorAgent on failures, retests, loops up to 5 iterations
4. **createPR** — commits changes and opens a GitHub PR

### Tools

Purpose-built tools that agents use to interact with the codebase:

**File I/O Tools** — read, write, and list files in the target repository
**Runner Tools** — execute vitest and parse results
**Redis Tools** — store and retrieve analysis, tests, and results

### State Management

Redis serves as the shared event log and knowledge base:

- **Code Analysis** — prior analysis used as RAG context for researchTestAgent
- **Test Metadata** — generated tests with source file mappings
- **Test Results** — pass/fail status, output, and failure details per iteration
- **Code Patches** — every fix applied by the editor agent with descriptions

## Execution Flow

1. **Discovery** — Scan target repo for source files
2. **Research & Generate** — researchTestAgent reads source + analysis, writes tests, runs them
3. **Fix Loop** — editorAgent reads failures, applies source code fixes, retests
4. **Iteration** — Step 3 repeats until all pass or max iterations reached
5. **PR Creation** — If all pass, commit and open a pull request

## Key Design Decisions

### Why Redis Over Direct Agent Communication

Agents communicate through Redis rather than calling each other directly because:

- **Auditability** — every decision is persisted and traceable
- **Decoupling** — agents can be developed, tested, and replaced independently
- **Replayability** — the entire session can be replayed from Redis data
- **Observability** — external tools can monitor agent behavior in real-time

### Why Two Agents + Workflow Instead of Five Specialized Agents

The 2-agent + workflow architecture was chosen over the previous 5-agent design because:

- **Reduced complexity** — one agent handles the entire research→generate→execute cycle autonomously
- **Fewer round-trips** — no need to coordinate between separate generator and executor agents
- **Autonomous test typing** — the agent determines test type from file content, eliminating separate discovery pipelines
- **Workflow orchestration** — Mastra Workflows provide built-in step sequencing, looping, and error handling, replacing manual orchestration code
- **Easier debugging** — fewer agents means fewer failure points and simpler traceability

### Why vitest

vitest is the test framework because:

- Native TypeScript support
- Fast execution with parallel test running
- Rich assertion API that the AI can work with effectively
- Wide adoption in the TypeScript ecosystem

## Next

- [Agents](/architecture/agents) — detailed breakdown of each agent
- [Tools](/architecture/tools) — how tools work and when they're used
- [Control Flow](/architecture/control-flow) — step-by-step execution flow
- [State Management](/architecture/state-management) — Redis data structures
