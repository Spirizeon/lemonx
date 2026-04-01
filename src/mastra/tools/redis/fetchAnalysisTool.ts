import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getRedisClient } from "../../../redis/client";

export const fetchAnalysisTool = createTool({
  id: "fetch-analysis",
  description: "Fetch stored code analysis from Redis to use as knowledge context for writing tests",
  inputSchema: z.object({
    filePath: z.string().optional().describe("Filter by file path, or omit to fetch all"),
  }),
  outputSchema: z.object({
    analyses: z.array(z.object({
      filePath: z.string(),
      language: z.string(),
      summary: z.string(),
      issues: z.array(z.string()),
    })),
  }),
  execute: async ({ context }) => {
    const redis = getRedisClient();

    let keys: string[];
    if (context.filePath) {
      keys = await redis.keys(`code_analysis:*${context.filePath}*`);
    } else {
      keys = await redis.keys("code_analysis:*");
    }

    const analyses: { filePath: string; language: string; summary: string; issues: string[] }[] = [];
    for (const key of keys) {
      const raw = await redis.get(key);
      if (raw) {
        const entry = JSON.parse(raw);
        analyses.push({
          filePath: entry.filePath,
          language: entry.language,
          summary: entry.summary,
          issues: entry.issues ?? [],
        });
      }
    }

    return { analyses };
  },
});
