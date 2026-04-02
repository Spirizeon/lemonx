#!/usr/bin/env node
import { init } from "./commands/init.js";

const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case "init":
    await init(args.slice(1));
    break;
  default:
    console.log(`
🍋 lemonx — AI-powered test generation, execution, and self-healing fixes

Usage:
  npx lemonx init [dir] [options]

Options:
  --runner <namespace>/<resource-class>  CircleCI runner resource class
  --help                                 Show this help message

Examples:
  npx lemonx init ./my-repo --runner my-org/lemon-runner
  npx lemonx init --runner my-org/lemon-runner

Run \`npx lemonx init\` in your target repo to set up CircleCI integration.
`);
    break;
}
