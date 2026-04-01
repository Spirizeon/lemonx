import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getRedisClient } from "../../../redis/client";
import { randomUUID } from "crypto";

export const storeTestsTool = createTool({
  id: "store-tests",
  description: "Store generated unit test code into Redis",
  inputSchema: z.object({
    filePath: z.string(),
    testFilePath: z.string(),
    testCode: z.string(),
  }),
  outputSchema: z.object({ id: z.string() }),
  execute: async ({ context }) => {
    const redis = getRedisClient();
    const id = randomUUID();
    const key = `unit_tests:${id}`;
    await redis.set(key, JSON.stringify({
      id,
      filePath: context.filePath,
      testFilePath: context.testFilePath,
      testCode: context.testCode,
      generatedAt: new Date().toISOString(),
      status: "pending",
    }));
    return { id };
  },
});
