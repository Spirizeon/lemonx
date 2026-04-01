import { Agent } from "@mastra/core/agent";
import { runTestsTool } from "../tools/runner/runTestsTool";
import { storeResultsTool } from "../tools/redis/storeResultsTool";
import { fetchAnalysisTool } from "../tools/redis/fetchAnalysisTool";

export const executorAgent = new Agent({
  id: "executorAgent",
  name: "Test Executor Agent",
  description: "Runs vitest on generated test files and stores pass/fail results in Redis",
  instructions: `
    You are a test execution agent. Your job:

    1. Use run-tests to execute the given test file via vitest.
    2. Collect pass/fail status, full output, and any individual test failures.
    3. Use store-results to persist everything to Redis including:
       - Which tests passed or failed
       - The full stdout output
       - Specific failure messages and errors
       - The current iteration number

    Be precise when capturing failure details — the editor agent depends on them.
    Always store results even if all tests pass.
  `,
  model: "cloudflare-workers-ai/@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  tools: { runTestsTool, storeResultsTool, fetchAnalysisTool },
});
