import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { writeFile, mkdir } from "fs/promises";
import { join, dirname } from "path";
import { getRedisClient } from "../../../redis/client";
import { randomUUID } from "crypto";

export const writeFileTool = createTool({
  id: "write-file",
  description: "Write or overwrite a file on disk. Used to save test files or apply code fixes.",
  inputSchema: z.object({
    path: z.string(),
    content: z.string(),
    patchDescription: z.string().optional(),
    iteration: z.coerce.number().optional(),
  }),
  outputSchema: z.object({ success: z.boolean() }),
  execute: async ({ context }) => {
    const base = process.env.TARGET_REPO ?? process.cwd();
    const fullPath = join(base, context.path);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, context.content, "utf-8");

    // Log patch to Redis if this is a code fix
    if (context.patchDescription) {
      const redis = getRedisClient();
      const id = randomUUID();
      await redis.set(`code_patches:${id}`, JSON.stringify({
        id,
        filePath: context.path,
        patchDescription: context.patchDescription,
        appliedAt: new Date().toISOString(),
        iteration: context.iteration ?? 0,
      }));
    }
    return { success: true };
  },
});
