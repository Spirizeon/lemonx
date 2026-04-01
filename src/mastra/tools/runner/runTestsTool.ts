import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const failurePattern = /✗\s+(.+)\n[\s\S]*?Error:\s+(.+)/g;

function parseFailures(output: string) {
  const failures: { testName: string; error: string }[] = [];
  let match;
  while ((match = failurePattern.exec(output)) !== null) {
    failures.push({ testName: match[1].trim(), error: match[2].trim() });
  }
  return failures;
}

export const runTestsTool = createTool({
  id: "run-tests",
  description: "Execute vitest on a specific test file and return pass/fail results",
  inputSchema: z.object({
    testFilePath: z.string().describe("e.g. src/__tests__/myModule.test.ts"),
  }),
  outputSchema: z.object({
    passed: z.boolean(),
    output: z.string(),
    failures: z.array(z.object({ testName: z.string(), error: z.string() })),
  }),
  execute: async ({ context }) => {
    try {
      const { stdout, stderr } = await execAsync(
        `npx vitest run ${context.testFilePath} --reporter=verbose`,
        { cwd: process.cwd() }
      );
      const output = stdout + stderr;
      const passed = !output.includes("FAIL") && !output.includes("failed");
      return { passed, output, failures: parseFailures(output) };
    } catch (err: any) {
      const output = err.stdout + err.stderr;
      return {
        passed: false,
        output,
        failures: parseFailures(output),
      };
    }
  },
});
