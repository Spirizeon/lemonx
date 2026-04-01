import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { readdir } from "fs/promises";
import { join } from "path";

export const listFilesTool = createTool({
  id: "list-files",
  description: "List all source files in a directory (recursively)",
  inputSchema: z.object({ dir: z.string() }),
  outputSchema: z.object({ files: z.array(z.string()) }),
  execute: async ({ context }) => {
    const entries = await readdir(join(process.cwd(), context.dir), {
      recursive: true,
    }) as string[];
    const files = entries.filter(f =>
      (f.endsWith(".ts") || f.endsWith(".js")) &&
      !f.includes("__tests__") &&
      !f.includes("node_modules")
    );
    return { files };
  },
});
