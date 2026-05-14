# Entry Points

lemon.test has three entry points, each serving a different execution mode.

## src/index.ts — Direct Execution

**Purpose**: Main entry point for the machine runner mode. Triggers the testFixWorkflow.

**Execution**:
```bash
npx tsx src/index.ts
```

**Flow**:
1. Discovers source files
2. Runs testFixWorkflow (researchAndGenerate → loop(checkAndFix) → createPR)
3. Prints a summary of results

**Environment Variables**:
| Variable | Default | Description |
|---|---|---|
| `TARGET_REPO` | `process.cwd()` | Path to the target repository |

**Output**: Console logs with progress and a final summary:
```
🏁 Done.
   Tests: passed (2 iterations)
```

---

## src/webhook-server.ts — Webhook Server

**Purpose**: Express.js server that receives webhooks from CircleCI, clones target repos, and runs the testFixWorkflow. Legacy/alternative mode.

**Execution**:
```bash
npx tsx src/webhook-server.ts
```

**Port**: Configured via `WEBHOOK_PORT` (default: `3456`)

### Endpoints

#### GET /health

Health check. Returns status, list of available agents, and workflows.

**Response**:
```json
{
  "status": "ok",
  "agents": [
    "researchTestAgent",
    "editorAgent"
  ],
  "workflows": [
    "testFixWorkflow"
  ]
}
```

#### POST /webhook/test-and-fix

Full generate + run + fix workflow. Synchronous — waits for completion.

**Request Body**:
```json
{
  "repoUrl": "owner/repo",
  "branch": "feature/my-branch",
  "commitSha": "abc123"
}
```

**Response**:
```json
{
  "status": "passed",
  "repo": "owner/repo",
  "branch": "feature/my-branch",
  "commit": "abc123",
  "iterations": 2,
  "files": 5,
  "changedFiles": ["src/__tests__/auth.test.ts", "src/services/auth.ts"],
  "pr": "https://github.com/owner/repo/pull/42"
}
```

**Side Effects**: If all tests pass and there are changes, automatically creates a branch, commits, pushes, and opens a GitHub PR.

#### POST /webhook/generate-tests

Generate tests only (runs the researchAndGenerate step of testFixWorkflow).

**Request Body**:
```json
{
  "repoUrl": "owner/repo",
  "branch": "feature/my-branch",
  "files": ["src/services/auth.ts"]
}
```

#### POST /webhook/run-tests

Run existing tests only (no generation or fixing).

**Request Body**:
```json
{
  "repoUrl": "owner/repo",
  "branch": "feature/my-branch",
  "testFile": "src/__tests__/auth.test.ts"
}
```

### Webhook Security

All POST endpoints support HMAC-SHA256 signature verification:

- Header: `X-Webhook-Signature: sha256=<hex>`
- Secret: `WEBHOOK_SECRET` environment variable
- If no secret is configured, verification is skipped

### Workspace Management

Each webhook request:
1. Clones the repo to a temp directory (`/tmp/lemonx-workspaces/<uuid>`)
2. Sets `LEMON_WORKSPACE` to the cloned directory
3. Runs the requested operation
4. Cleans up the temp directory in a `finally` block

---

## lemonx CLI

**Package**: `lemonx` (npm)
**Version**: 0.2.0
**Source**: `lemonx-pkg/src/cli/`

### Commands

#### `npx lemonx init [dir]`

Generates `.circleci/config.yml` in the target repository.

**Usage**:
```bash
# Initialize current directory
npx lemonx init

# Initialize specific directory
npx lemonx init /path/to/repo
```

**What it does**:
1. Creates `.circleci/` directory if it doesn't exist
2. Writes a CircleCI config with jobs for the test-fix workflow
3. Skips if the config already contains lemonx integration

**Output**: CircleCI config that runs on a CircleCI machine runner with lemon.test pre-installed.
