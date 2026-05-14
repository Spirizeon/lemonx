import "dotenv/config";
import { mastra } from "./mastra";

const GITHUB_TOKEN = process.env.LEMONX ?? process.env.GITHUB_TOKEN ?? "";
const GITHUB_REPOSITORY = process.env.GITHUB_REPOSITORY ?? "";
const GITHUB_REF = process.env.GITHUB_REF ?? "";
const GITHUB_SHA = process.env.GITHUB_SHA ?? "";
const TARGET_REPO = process.env.TARGET_REPO ?? process.cwd();
const LEMON_WORKSPACE = process.env.LEMON_WORKSPACE ?? "/workspace";

function checkRequiredEnvVars() {
  const missing: string[] = [];
  if (!process.env.CLOUDFLARE_ACCOUNT_ID) missing.push("CLOUDFLARE_ACCOUNT_ID");
  if (!process.env.CLOUDFLARE_API_KEY) missing.push("CLOUDFLARE_API_KEY");
  const hasGitHubToken = process.env.LEMONX || process.env.GITHUB_TOKEN;
  if (!hasGitHubToken) missing.push("LEMONX (GitHub PAT)");
  if (missing.length > 0) {
    console.log("\n[LEMON] ⚠️  Missing required repository secrets:");
    missing.forEach(v => console.log(`   - ${v}`));
    console.log("\n   Add secrets at: Settings → Secrets and variables → Actions");
    console.log("   - CLOUDFLARE_ACCOUNT_ID");
    console.log("   - CLOUDFLARE_API_KEY");
    console.log("   - LEMONX (Personal Access Token with 'repo' scope)\n");
  }
}

checkRequiredEnvVars();

console.log("\n[LEMON] 🚀 Starting test-fix workflow...");
console.log(`   Target: ${TARGET_REPO}`);
console.log(`   Workspace: ${LEMON_WORKSPACE}`);

const workflow = mastra.getWorkflow("testFixWorkflow");
const result = await workflow.start({
  inputData: {
    repoPath: TARGET_REPO,
    githubToken: GITHUB_TOKEN,
    githubRepo: GITHUB_REPOSITORY,
    githubRef: GITHUB_REF,
    githubSha: GITHUB_SHA,
  },
});

const output = result.output as { prUrl: string | null } | undefined;

console.log("\n[LEMON] 🏁 Workflow complete.");
if (output?.prUrl) {
  console.log(`   🎉 PR: ${output.prUrl}`);
} else {
  console.log("   No PR created (missing token, no changes, or workflow incomplete)");
}

process.exit(0);
