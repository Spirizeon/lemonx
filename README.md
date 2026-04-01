# lemon.test

> Your codebase. Zero blind spots.

An agentic AI testing platform that autonomously generates, executes, and fixes unit tests for TypeScript/JavaScript codebases.

## How It Works

lemon.test deploys specialized AI agents that form a generate-run-fix loop:

1. **Test Generation** -- The generator agent reads your source code and writes comprehensive vitest unit tests covering happy paths, edge cases, and error cases
2. **Test Execution** -- The executor agent runs the tests and records pass/fail results
3. **Self-Healing Fixes** -- When tests fail, the editor agent analyzes the failures and applies code fixes automatically
4. **Iterative Refinement** -- Steps 2-3 repeat until all tests pass or the maximum iteration count is reached

## Architecture

The system uses a multi-agent architecture powered by [Mastra](https://mastra.ai/), with three specialized agents:

| Agent | Role |
|---|---|
| `testGeneratorAgent` | Reads source files and generates vitest unit tests |
| `executorAgent` | Runs tests via vitest and stores results in Redis |
| `editorAgent` | Reads failures from Redis and applies source code fixes |

Agents communicate through Redis, which serves as an event log for test results, code analysis, and patches -- enabling full auditability across iterations.

### Tools

Each agent is equipped with purpose-built tools:

- **File I/O** -- Read, write, and list files in the target repository
- **Redis Operations** -- Store/fetch analysis, test results, and generated tests
- **Test Runner** -- Execute vitest and parse pass/fail output

## Prerequisites

- Node.js (latest)
- Redis server (default: `localhost:6379`)
- Cloudflare Workers AI API credentials

## Setup

1. Install dependencies:

```bash
npm install
```

2. Configure environment variables in `.env`:

```env
CLOUDFLARE_ACCOUNT_ID=your-account-id
CLOUDFLARE_API_KEY=your-api-key
REDIS_HOST=localhost
REDIS_PORT=6379
TARGET_REPO=/path/to/the/repository/you/want/to/test
```

3. Run the platform:

```bash
npm run dev
```

## Tech Stack

- **Language**: TypeScript (ES2020, NodeNext modules)
- **AI Framework**: Mastra (`@mastra/core`, `@mastra/memory`, `@mastra/libsql`, `@mastra/rag`)
- **LLM Providers**: Cloudflare Workers AI (Qwen 30B, Llama 3.3 70B), OpenAI (GPT-5-mini for research)
- **Test Framework**: vitest
- **State Management**: Redis (ioredis) for results/analysis/patches, LibSQL for agent memory
- **Schema Validation**: Zod
- **Runtime**: tsx

## Project Structure

```
src/
├── index.ts                        # Entry point: orchestrates the test-fix-retest loop
├── redis/
│   └── client.ts                   # Redis client singleton
└── mastra/
    ├── index.ts                    # Mastra instance exporting all agents
    ├── agents/
    │   ├── testGeneratorAgent.ts   # Generates vitest unit tests
    │   ├── executorAgent.ts        # Runs tests, stores results
    │   ├── editorAgent.ts          # Applies code fixes to source files
    │   ├── orchestratorAgent.ts    # (Unused) Supervisor agent
    │   ├── research-agent.ts       # (Unused) Standalone research agent
    │   └── myAgent.ts              # Template/example agent
    └── tools/
        ├── fs/                     # File I/O tools (read, write, list)
        ├── redis/                  # Redis tools (fetch/store analysis, results)
        └── runner/                 # Test execution tool
```

## CI/CD

The project includes a CircleCI pipeline with an AI review gatekeeper that checks for acknowledged AI comments before allowing merges to main.

## License

Open Source
