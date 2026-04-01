import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getRedisClient } from "../../../redis/client";
import { randomUUID } from "crypto";

export const storeResultsTool = createTool({
  id: "store-results",
  description: "Store test execution results into Redis",
  inputSchema: z.object({
    testId: z.string(),
    filePath: z.string(),
    passed: z.boolean(),
    output: z.string(),
    failures: z.array(z.object({ testName: z.string(), error: z.string() })),
    iteration: z.coerce.number(),
  }),
  outputSchema: z.object({ id: z.string() }),
  execute: async ({ context }) => {
    const redis = getRedisClient();
    const id = randomUUID();
    const key = `test_results:${id}`;
    await redis.set(key, JSON.stringify({
      id,
      testId: context.testId,
      filePath: context.filePath,
      passed: context.passed,
      output: context.output,
      failures: context.failures,
      runAt: new Date().toISOString(),
      iteration: context.iteration,
    }));
    return { id };
  },
});
