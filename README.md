# lemon.test

> Your codebase. Zero blind spots.

An agentic AI testing platform that autonomously generates, executes, and fixes unit, integration, and E2E tests for TypeScript/JavaScript codebases.

## How It Works

lemon.test runs on a CircleCI machine runner. When you push to any branch, CircleCI assigns the job to your runner, which:

1. **Clones your repo** — CircleCI checks out your code directly on the runner
2. **Generates tests** — AI agents read your source code and write comprehensive vitest tests
3. **Runs tests** — The executor runs tests and records pass/fail results
4. **Fixes failures** — The editor agent analyzes failures and applies code fixes
5. **Iterates** — Steps 3-4 repeat until all tests pass or max iterations reached
6. **Reports back** — CircleCI receives the results and gates your pipeline

No webhooks, no tunnels, no external servers needed.

## Architecture

The system uses a multi-agent architecture powered by [Mastra](https://mastra.ai/), with five specialized agents:

| Agent | Role |
|---|---|
| `testGeneratorAgent` | Reads source files and generates vitest unit tests |
| `integrationGeneratorAgent` | Reads source files and generates vitest integration tests |
| `e2eGeneratorAgent` | Reads source files and generates vitest E2E tests |
| `executorAgent` | Runs tests via vitest and stores results in Redis |
| `editorAgent` | Reads failures from Redis and applies source code fixes |

Agents communicate through Redis, which serves as an event log for test results, code analysis, and patches -- enabling full auditability across iterations.

### Tools

Each agent is equipped with purpose-built tools:

- **File I/O** -- Read, write, and list files in the target repository
- **Redis Operations** -- Store/fetch analysis, test results, and generated tests
- **Test Runner** -- Execute vitest and parse pass/fail output

## Prerequisites

- Docker + Docker Compose
- CircleCI account with machine runner access
- Cloudflare Workers AI API credentials
- GitHub token (for PR creation, optional)

## Setup

### 1. Create a CircleCI machine runner

```bash
# Create namespace (skip if you already have one)
circleci namespace create <your-org> --org-id <your-org-id>

# Create resource class and get the token
circleci runner resource-class create <your-org>/lemon-runner "AI test runner" --generate-token
```

Save the resource class token — you'll need it next.

### 2. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` with your values:

```env
CLOUDFLARE_ACCOUNT_ID=your-account-id
CLOUDFLARE_API_KEY=your-api-key
CIRCLECI_RUNNER_NAME=lemon-runner
CIRCLECI_RUNNER_API_AUTH_TOKEN=<token-from-step-1>
GITHUB_TOKEN=your-github-token        # optional, for PR creation
```

### 3. Start the runner

```bash
docker compose -f docker-compose.runner.yml up -d
```

This starts a Redis container and the CircleCI machine runner container. The runner immediately connects to CircleCI and waits for jobs.

### 4. Set up your target repository

```bash
npx lemonx init /path/to/your/repo
```

This generates `.circleci/config.yml` in your target repo. Open it and replace `<namespace>/<resource-class>` with your actual resource class (e.g., `my-org/lemon-runner`).

### 5. Push and watch it work

Push to any branch (not main) and CircleCI will:

1. Route the job to your machine runner
2. The runner executes the AI test-fix loop directly on your code
3. CircleCI receives the results and passes/fails the pipeline

## Machine Runner Architecture

```
Your Repo (GitHub)
       │
       │ push
       ▼
  CircleCI Cloud
       │
       │ assigns job
       ▼
Your Machine Runner (Docker)
  ├── circleci/runner-agent:machine-3  (CircleCI runner)
  ├── Redis                            (agent state)
  └── lemon.test agents
       ├── testGeneratorAgent
       ├── integrationGeneratorAgent
       ├── e2eGeneratorAgent
       ├── executorAgent
       └── editorAgent
```

The runner image (`Dockerfile.runner`) extends `circleci/runner-agent:machine-3` with Node.js, git, and the lemon.test source code. CircleCI jobs run directly inside this environment.

## Available Workflows

| Workflow | What it does |
|---|---|
| `ai-test-loop` | Full generate + run + fix cycle for unit, integration, and E2E tests (default) |
| `ai-generate-tests` | Generate unit tests only |
| `ai-run-tests` | Run existing tests only |

## Tech Stack

- **Language**: TypeScript (ES2020, NodeNext modules)
- **AI Framework**: Mastra (`@mastra/core`, `@mastra/memory`, `@mastra/libsql`, `@mastra/rag`)
- **LLM Providers**: Cloudflare Workers AI (Llama 3.3 70B)
- **Test Framework**: vitest
- **State Management**: Redis (ioredis) for results/analysis/patches, LibSQL for agent memory
- **Schema Validation**: Zod
- **Runtime**: tsx
- **Runner**: CircleCI Machine Runner 3 on Docker

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

## CLI Package

The `lemonx` npm package generates CircleCI config for target repositories.

```bash
npx lemonx init /path/to/your/repo
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

## CI/CD

The project includes a CircleCI pipeline with an AI review gatekeeper that checks for acknowledged AI comments before allowing merges to main.

## License

Open Source 9
