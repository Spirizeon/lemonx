---
layout: home

hero:
  name: lemon.test
  text: Your codebase. Zero blind spots.
  tagline: An agentic AI testing platform that autonomously generates, executes, and fixes tests for TypeScript/JavaScript codebases.
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: How It Works
      link: /guide/how-it-works
    - theme: alt
      text: View on GitHub
      link: https://github.com/berzi/lemon

features:
  - icon: 🧠
    title: AI-Powered Test Generation
    details: A research agent reads your source code, autonomously determines test types, and writes comprehensive vitest unit, integration, and E2E tests — no manual test writing required.
  - icon: 🔁
    title: Self-Healing Test Loop
    details: Tests run, failures are analyzed, and the editor agent applies source code fixes automatically. The loop iterates until everything passes.
  - icon: 🐙
    title: GitHub Actions Native
    details: Runs as a GitHub Actions job on every push and PR. Your code never leaves your repository — the AI agents work directly on the checked-out code.
  - icon: 📋
    title: Full Auditability
    details: Every test result, code analysis, and patch flows through Redis as an event log. Full traceability across every iteration and agent decision.
---

## Quick Start

Get up and running in minutes:

```bash
# 1. Add Cloudflare credentials to your repo secrets
#    Settings → Secrets → CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_KEY

# 2. Push to any branch (not main)
git push origin feature/my-branch
```

GitHub Actions will automatically run the AI test-fix workflow.

## How It Works

```
┌─────────────────┐
│  Your Repo      │
│  (GitHub)       │
└────────┬────────┘
         │ push / PR
         ▼
┌─────────────────────────────────────┐
│     GitHub Actions Runner           │
│                                     │
│  ┌───────────┐  ┌───────────────┐   │
│  │  Checkout │  │    Redis      │   │
│  │  (code)   │  │  (state/log)  │   │
│  └─────┬─────┘  └───────┬───────┘   │
│        │                │           │
│        ▼                ▼           │
│  ┌───────────────────────────┐      │
│  │    testFixWorkflow        │      │
│  │                           │      │
│  │  researchTestAgent        │      │
│  │  editorAgent              │      │
│  └───────────────────────────┘      │
│                                     │
│  Research → Generate → Run → Fix   │
│         → Repeat → PR              │
└─────────────────────────────────────┘
```

## Key Concepts

| Concept | Description |
|---|---|
| **Agents** | Two specialized AI agents powered by Mastra: `researchTestAgent` (research + generate + execute) and `editorAgent` (fix source code) |
| **Workflow** | `testFixWorkflow` orchestrates the full pipeline: discover → researchAndGenerate → loop(checkAndFix) → createPR |
| **Tools** | Purpose-built file I/O, Redis operations, and test runner tools that agents use to interact with your codebase |
| **Runner** | GitHub Actions runner — your code is checked out, Docker Compose spins up Redis + AI agents, results determine job success/failure |

## Tech Stack

- **AI Framework** — Mastra (`@mastra/core`, `@mastra/memory`, `@mastra/libsql`)
- **LLM** — Cloudflare Workers AI (Llama 3.3 70B)
- **Test Framework** — vitest
- **State** — Redis (ioredis) + LibSQL (agent memory)
- **Runtime** — TypeScript, tsx, Node.js
- **CI/CD** — GitHub Actions

## Explore the Docs

| Section | What you'll find |
|---|---|
| [Guide](/guide/getting-started) | Getting started, quick start, and how the platform works |
| [Architecture](/architecture/overview) | Deep dive into agents, tools, control flow, and state management |
| [Reference](/reference/agents) | Agents API, tools API, entry points, and configuration |
| [Deployment](/deployment/github-actions) | GitHub Actions workflow, Docker setup, and secrets configuration |
