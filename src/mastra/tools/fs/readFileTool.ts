import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { readFile } from "fs/promises";
import { join } from "path";

export const readFileTool = createTool({
  id: "read-file",
  description: "Read a source file from the repository",
  inputSchema: z.object({ path: z.string() }),
  outputSchema: z.object({ content: z.string() }),
  execute: async ({ context }) => {
  const base = process.env.TARGET_REPO ?? process.cwd();
  const content = await readFile(join(base, context.path), "utf-8");
  return { content };
},
  });
