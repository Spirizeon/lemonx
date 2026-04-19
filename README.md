# lemon.test

> Your codebase. Zero blind spots.

An agentic AI testing platform that autonomously generates, executes, and fixes unit, integration, and E2E tests for TypeScript/JavaScript codebases.

## How It Works

lemon.test runs as a GitHub Actions workflow. When you push to any branch, the AI agents:

1. **Discover source files** — Scans your codebase for testable files
2. **Generate tests** — AI agents read your source code and write comprehensive vitest tests
3. **Run tests** — The executor runs tests and records pass/fail results
4. **Fix failures** — The editor agent analyzes failures and applies code fixes
5. **Iterate** — Steps 3-4 repeat until all tests pass or max iterations reached
6. **Gate your pipeline** — The GitHub Actions job passes or fails based on results

No external servers, no webhooks, no tunnels. Your code never leaves your repository.

## Architecture

The system uses a multi-agent architecture powered by [Mastra](https://mastra.ai/), with five specialized agents:

| Agent | Role |
|---|---|
| `testGeneratorAgent` | Reads source files and generates vitest unit tests |
| `integrationGeneratorAgent` | Reads source files and generates vitest integration tests |
| `e2eGeneratorAgent` | Reads source files and generates vitest E2E tests |
| `executorAgent` | Runs tests via vitest and stores results in Redis |
| `editorAgent` | Reads failures from Redis and applies source code fixes |

Agents communicate through Redis, which serves as an event log for test results, code analysis, and patches — enabling full auditability across iterations.

### Tools

Each agent is equipped with purpose-built tools:

- **File I/O** — Read, write, and list files in the target repository
- **Redis Operations** — Store/fetch analysis, test results, and generated tests
- **Test Runner** — Execute vitest and parse pass/fail output

## Quick Start

### 1. Add Cloudflare and PAT as Secrets

Go to your GitHub repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**:

| Secret | Description |
|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID |
| `CLOUDFLARE_API_KEY` | Your Cloudflare API token |
| `LEMONX` | GitHub Personal Access Token with `repo` scope (for creating PRs) |

### 2. Push to Any Branch

```bash
git push origin feature/my-branch
```

GitHub Actions will automatically run the AI test-fix loop. The job passes if all tests pass, fails otherwise.

## Local Development

```bash
cp .env.example .env
# Edit .env with your Cloudflare credentials
npm run docker:up
```

## Architecture Diagram

```
Your Repo (GitHub)
       │
       │ push / PR
       ▼
GitHub Actions Runner (ubuntu-latest)
   ├── Checkout your code
   ├── Redis (agent state)
   └── lemon.test agents
         ├── testGeneratorAgent
         ├── integrationGeneratorAgent
         ├── e2eGeneratorAgent
         ├── executorAgent
         └── editorAgent
```

## Available Workflows

| Workflow | What it does |
|---|---|
| `ai-test-loop` | Full generate + run + fix cycle for unit, integration, and E2E tests (default) |

Triggers on every push and pull request (except `main`).

## Tech Stack

- **Language**: TypeScript (ES2020, NodeNext modules)
- **AI Framework**: Mastra (`@mastra/core`, `@mastra/memory`, `@mastra/libsql`, `@mastra/rag`)
- **LLM Providers**: Cloudflare Workers AI (Qwen 30B)
- **Test Framework**: vitest
- **State Management**: Redis (ioredis) for results/analysis/patches, LibSQL for agent memory
- **Schema Validation**: Zod
- **Runtime**: tsx
- **CI/CD**: GitHub Actions + Docker Compose

## Project Structure

```
src/
├── index.ts                        # Entry point: orchestrates the test-fix-retest loop
├── webhook-server.ts               # (Legacy) Webhook server for external triggers
├── redis/
│   └── client.ts                   # Redis client singleton
└── mastra/
    ├── index.ts                    # Mastra instance exporting all agents
    ├── agents/
    │   ├── testGeneratorAgent.ts       # Generates vitest unit tests
    │   ├── integrationGeneratorAgent.ts # Generates vitest integration tests
    │   ├── e2eGeneratorAgent.ts        # Generates vitest E2E tests
    │   ├── executorAgent.ts            # Runs tests, stores results
    │   ├── editorAgent.ts              # Applies code fixes to source files
    │   ├── orchestratorAgent.ts        # (Unused) Supervisor agent
    │   ├── research-agent.ts           # (Unused) Standalone research agent
    │   └── myAgent.ts                  # Template/example agent
    └── tools/
        ├── fs/                     # File I/O tools (read, write, list)
        ├── redis/                  # Redis tools (fetch/store analysis, results)
        └── runner/                 # Test execution tool
```

## Testing

The project includes integration and E2E tests powered by vitest.

```bash
# All tests
npm test

# Integration tests only
npm run test:integration

# E2E tests only
npm run test:e2e
```

## Documentation

Full documentation is available at [spirizeon/lemonx/docs](https://github.com/spirizeon/lemonx/tree/main/docs):

- [Getting Started](docs/guide/getting-started.md)
- [How It Works](docs/guide/how-it-works.md)
- [Architecture](docs/architecture/overview.md)
- [API Reference](docs/reference/agents.md)
- [GitHub Actions Deployment](docs/deployment/github-actions.md)

## License

Open Source
