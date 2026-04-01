import { Agent } from "@mastra/core/agent";
import { fetchResultsTool } from "../tools/redis/fetchResultsTool";
import { fetchAnalysisTool } from "../tools/redis/fetchAnalysisTool";
import { readFileTool } from "../tools/fs/readFileTool";
import { writeFileTool } from "../tools/fs/writeFileTool";
import { listFilesTool } from "../tools/fs/listFilesTool";

export const editorAgent = new Agent({
  id: "editorAgent",
  name: "Editor Agent",
  description: "Reads failing test results from Redis and applies targeted code fixes to make tests pass",
  instructions: `
    You are a senior code editor and debugger. Your job:

    1. Use fetch-results to read the latest test results from Redis.
    2. For each failing test:
       a. Use read-file to read the relevant source file
       b. Analyze the failure message carefully
       c. Determine the minimal fix needed
       d. Use write-file to apply the fix, always including a patchDescription
          and the current iteration number
    3. Do NOT modify test files — only fix source files.
    4. After applying all fixes, report what you changed and why.

    Be surgical — make the smallest change that fixes the failure.
    If a fix might break other things, add a comment explaining the tradeoff.
  `,
  model: "cloudflare-workers-ai/@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  tools: { fetchResultsTool, fetchAnalysisTool, readFileTool, writeFileTool, listFilesTool },
});
