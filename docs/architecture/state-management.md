# State Management

lemon.test uses Redis as its primary state store and shared event log. All agent communication, test results, code analysis, and code patches flow through Redis.

## Redis Architecture

Redis serves as the **nervous system** of the platform — agents don't communicate with each other directly, they read from and write to Redis.

### Connection

The Redis client is a singleton managed in `src/redis/client.ts` using the `ioredis` library. Connection is configured via environment variables:

```env
REDIS_HOST=redis
REDIS_PORT=6379
```

## Key Patterns

### Code Analysis: `code_analysis:*`

**Purpose**: Prior code analysis used as RAG (Retrieval-Augmented Generation) context by researchTestAgent.

**Written by**: External analysis process (not part of the core lemon.test loop)

**Read by**: researchTestAgent via `fetchAnalysisTool`

**Structure**:
```json
{
  "filePath": "src/services/auth.ts",
  "language": "typescript",
  "summary": "Authentication service handling JWT tokens",
  "issues": ["Missing null check on user object", "No rate limiting"]
}
```

**Usage**: researchTestAgent fetches this before reading source files to understand the file's purpose and known issues, enabling it to write more targeted tests.

---

### Test Metadata: `test_metadata:*`

**Purpose**: Metadata about generated tests.

**Written by**: researchTestAgent via `storeTestsTool`

**Structure**:
```json
{
  "id": "uuid",
  "filePath": "src/services/auth.ts",
  "testFilePath": "src/__tests__/auth.test.ts",
  "testCode": "import { describe, it, expect } from 'vitest'...",
  "testType": "unit",
  "generatedAt": "2024-01-15T10:30:00.000Z",
  "status": "pending"
}
```

---

### Test Results: `test_results:*`

**Purpose**: Test execution results — the primary communication channel between researchTestAgent and editorAgent.

**Written by**: researchTestAgent via `storeResultsTool`

**Read by**: editorAgent via `fetchResultsTool`

**Structure**:
```json
{
  "id": "uuid",
  "testId": "unique-test-id",
  "filePath": "src/__tests__/auth.test.ts",
  "passed": false,
  "output": "✓ should create token\n✗ should reject invalid token\n  Error: expected 401 but got 200",
  "failures": [
    {
      "testName": "should reject invalid token",
      "error": "expected 401 but got 200"
    }
  ],
  "runAt": "2024-01-15T10:31:00.000Z",
  "iteration": 1
}
```

**Key fields**:
- `passed` — boolean indicating if all tests in the file passed
- `failures` — array of individual test failures with names and error messages
- `iteration` — which iteration of the fix loop this result belongs to

---

### Code Patches: `code_patches:*`

**Purpose**: Audit log of all code fixes applied by the editor agent.

**Written by**: `writeFileTool` (automatically when `patchDescription` is provided)

**Structure**:
```json
{
  "id": "uuid",
  "filePath": "src/services/auth.ts",
  "patchDescription": "Added null check before accessing user.permissions",
  "appliedAt": "2024-01-15T10:32:00.000Z",
  "iteration": 1
}
```

## Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                      Redis Key Space                         │
│                                                              │
│  code_analysis:hash1    ← RAG context (pre-loaded)          │
│  code_analysis:hash2                                        │
│                                                              │
│  test_metadata:uuid1    ← Generated test metadata           │
│  test_metadata:uuid2                                        │
│                                                              │
│  test_results:uuid1     ← Test execution results            │
│  test_results:uuid2     ← (researchTestAgent → editorAgent) │
│                                                              │
│  code_patches:uuid1     ← Applied code fixes (audit log)    │
│  code_patches:uuid2                                        │
└─────────────────────────────────────────────────────────────┘
```

## State Lifecycle

### During Research & Generation

1. researchTestAgent fetches `code_analysis:*` for context
2. researchTestAgent writes tests to disk
3. researchTestAgent runs tests with vitest
4. researchTestAgent stores metadata to `test_metadata:*`
5. researchTestAgent stores results to `test_results:*`

### During Fixing

1. editorAgent fetches `test_results:*` for current iteration
2. editorAgent reads failing source files
3. editorAgent writes fixes to disk
4. writeFileTool automatically logs patches to `code_patches:*`
5. researchTestAgent retests and stores new results to `test_results:*`

### Between Iterations

- New `test_results:*` entries are created each iteration
- editorAgent filters results by iteration number when fetching
- Previous iteration results remain in Redis for audit purposes

## Why Redis

Redis was chosen over alternatives because:

- **Speed** — sub-millisecond reads/writes, no bottleneck for agent communication
- **Simplicity** — key-value model maps naturally to the data structures
- **Persistence** — data survives container restarts (with volume mounting)
- **Observability** — `redis-cli` provides instant visibility into agent state
- **No schema migrations** — flexible JSON documents adapt as the system evolves

## Monitoring

You can inspect the current state at any time:

```bash
# Connect to Redis
docker compose -f docker-compose.runner.yml exec redis redis-cli

# View all keys
KEYS *

# Inspect a specific result
GET test_results:<uuid>

# View all patches
KEYS code_patches:*

# Count test results
DBSIZE
```
