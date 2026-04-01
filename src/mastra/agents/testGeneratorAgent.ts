import { Agent } from "@mastra/core/agent";
import { fetchAnalysisTool } from "../tools/redis/fetchAnalysisTool";
import { storeTestsTool } from "../tools/redis/storeTestsTool";
import { readFileTool } from "../tools/fs/readFileTool";
import { writeFileTool } from "../tools/fs/writeFileTool";

export const testGeneratorAgent = new Agent({
  id: "testGeneratorAgent",
  name: "Test Generator Agent",
  description: "Generates vitest unit tests for source files using Redis code analysis as knowledge context",
  instructions: `
    You are an expert test engineer. Your job:

    1. Use fetch-analysis to retrieve prior code analysis from Redis — this is your RAG knowledge base.
       It tells you what each file does, its language, and known issues.
    2. Use read-file to read the actual source file content.
    3. Write comprehensive vitest unit tests covering:
       - Happy path (normal expected behavior)
       - Edge cases (empty input, nulls, boundary values)
       - Error cases (exceptions, invalid input)
       - Any issues flagged in the stored analysis
    4. Use write-file to save the test to src/__tests__/<filename>.test.ts
    5. Use store-tests to persist the test metadata to Redis.

    Write tests using vitest syntax: import { describe, it, expect, vi } from 'vitest'
    Mock external dependencies with vi.mock().
    Be thorough — aim for high coverage.
  `,
  model: "cloudflare-workers-ai/@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  tools: { fetchAnalysisTool, storeTestsTool, readFileTool, writeFileTool },
});
