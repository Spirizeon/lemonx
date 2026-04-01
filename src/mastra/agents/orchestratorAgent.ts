import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import { LibSQLStore } from "@mastra/libsql";
import { testGeneratorAgent } from "./testGeneratorAgent";
import { executorAgent } from "./executorAgent";
import { editorAgent } from "./editorAgent";
import { fetchResultsTool } from "../tools/redis/fetchResultsTool";
import { listFilesTool } from "../tools/fs/listFilesTool";

export const orchestratorAgent = new Agent({
  id: "orchestratorAgent",
  name: "Orchestrator",
  description: "Coordinates the full test-fix-retest loop until all tests pass",
  instructions: `
    You are a test orchestration supervisor. You manage three specialist agents:
    - testGeneratorAgent: writes unit tests using Redis knowledge as RAG
    - executorAgent: runs the tests and stores results
    - editorAgent: reads failures and fixes source code

    Your loop:
    1. Call testGeneratorAgent to generate tests for the given source files.
    2. Call executorAgent to run those tests and store results.
    3. Use fetch-results to check if all tests passed.
    4. If tests failed:
       a. Call editorAgent to fix the failing code.
       b. Call executorAgent again with incremented iteration.
       c. Repeat from step 3.
    5. Stop when all tests pass OR after 5 iterations max to avoid infinite loops.

    Track the iteration count yourself. Report a summary at the end:
    - Which files were tested
    - How many iterations it took
    - What fixes were applied
    - Final pass/fail status
  `,
  model: "cloudflare-workers-ai/@cf/qwen/qwen3-30b-a3b-fp8",
  agents: { testGeneratorAgent, executorAgent, editorAgent },
  tools: { fetchResultsTool, listFilesTool },
  memory: new Memory({
    storage: new LibSQLStore({
      id: "orchestrator-storage",
      url: "file:./orchestrator.db",
    }),
  }),
});
