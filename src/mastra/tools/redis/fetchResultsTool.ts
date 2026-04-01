import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getRedisClient } from "../../../redis/client";

export const fetchResultsTool = createTool({
  id: "fetch-results",
  description: "Fetch latest test results from Redis to determine what failed",
  inputSchema: z.object({
    iteration: z.coerce.number().optional().describe("Fetch results for a specific iteration"),
  }),
  outputSchema: z.object({
    results: z.array(z.object({
      id: z.string(),
      testId: z.string(),
      filePath: z.string(),
      passed: z.boolean(),
      failures: z.array(z.object({ testName: z.string(), error: z.string() })),
      iteration: z.number(),
    })),
    allPassed: z.boolean(),
  }),
  execute: async ({ context }) => {
    const redis = getRedisClient();
    const keys = await redis.keys("test_results:*");

    const results: { id: string; testId: string; filePath: string; passed: boolean; failures: { testName: string; error: string }[]; iteration: number }[] = [];
    for (const key of keys) {
      const raw = await redis.get(key);
      if (raw) {
        const entry = JSON.parse(raw);
        if (context.iteration !== undefined && entry.iteration !== context.iteration) {
          continue;
        }
        results.push({
          id: entry.id,
          testId: entry.testId,
          filePath: entry.filePath,
          passed: entry.passed,
          failures: entry.failures ?? [],
          iteration: entry.iteration,
        });
      }
    }

    return { results, allPassed: results.length > 0 && results.every(r => r.passed) };
  },
});
