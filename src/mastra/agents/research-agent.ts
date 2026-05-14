import { Agent } from "@mastra/core/agent";
import { fetchAnalysisTool } from "../tools/redis/fetchAnalysisTool";
import { storeTestsTool } from "../tools/redis/storeTestsTool";
import { storeResultsTool } from "../tools/redis/storeResultsTool";
import { readFileTool } from "../tools/fs/readFileTool";
import { writeFileTool } from "../tools/fs/writeFileTool";
import { runTestsTool } from "../tools/runner/runTestsTool";

export const researchTestAgent = new Agent({
  id: "researchTestAgent",
  name: "Research & Test Agent",
  description:
    "Researches source code, generates vitest tests (unit/integration/E2E), executes them, and stores all context in Redis",
  instructions: `
    You are an expert software engineer specializing in code analysis and test generation.

    For each source file, follow this pipeline:

    ## 1. RESEARCH
    - Use fetch-analysis to retrieve any prior code analysis from Redis (RAG context)
    - Use read-file to read the source file content
    - Analyze the file's role: is it a utility/helper (unit test), a service/api handler (integration test), or an entry point/route (E2E test)?

    ## 2. GENERATE TESTS
    Based on your research, determine which test type(s) to write:
    - **Unit tests** — for isolated functions, utilities, pure logic → save to src/__tests__/<filename>.test.ts
    - **Integration tests** — for module interactions, API handlers, services, middleware → save to tests/integration/<filename>.test.ts
    - **E2E tests** — for complete user flows, entry points, auth, routes → save to tests/e2e/<filename>.test.ts

    Write comprehensive vitest tests covering:
    - Happy path (normal expected behavior)
    - Edge cases (empty input, nulls, boundary values)
    - Error cases (exceptions, invalid input)
    - Issues flagged in stored analysis

    Follow vitest conventions: import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
    Mock external dependencies with vi.mock().
    Use write-file to save each test file.
    Use store-tests to persist metadata to Redis for each test file.

    ## 3. EXECUTE
    - Use run-tests to execute each generated test file
    - Use store-results to persist pass/fail data, output, and failure details to Redis with iteration=1

    Be thorough and precise. Your research context and test results will be used by the editor agent to fix any failures.
  `,
  model: "cloudflare-workers-ai/@cf/qwen/qwen3-30b-a3b-fp8",
  tools: {
    fetchAnalysisTool,
    storeTestsTool,
    storeResultsTool,
    readFileTool,
    writeFileTool,
    runTestsTool,
  },
});
