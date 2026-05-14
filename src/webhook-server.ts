import express, { Request, Response } from "express";
import { mastra } from "./mastra/index.js";
import { readdir, readFile, mkdir, rm } from "fs/promises";
import { join } from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { tmpdir } from "os";
import { randomUUID } from "crypto";

const execAsync = promisify(exec);

const app = express();
app.use(express.json());

const PORT = process.env.WEBHOOK_PORT ?? 3456;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET ?? "";
const WORK_DIR = join(tmpdir(), "lemonx-workspaces");
const GITHUB_TOKEN = process.env.GITHUB_TOKEN ?? "";

// ── Webhook signature verification ──────────────────────────────
async function verifySignature(req: Request): Promise<boolean> {
  if (!WEBHOOK_SECRET) return true;
  const sig = req.headers["x-webhook-signature"] as string;
  if (!sig) return false;
  const crypto = await import("crypto");
  const expected = crypto
    .createHmac("sha256", WEBHOOK_SECRET)
    .update(JSON.stringify(req.body))
    .digest("hex");
  return sig === `sha256=${expected}`;
}

// ── Git clone helper ────────────────────────────────────────────
async function cloneRepo(repoUrl: string, branch: string, commitSha: string): Promise<string> {
  const workspaceId = randomUUID().slice(0, 8);
  const workspace = join(WORK_DIR, workspaceId);
  await mkdir(workspace, { recursive: true });

  console.log(`  📦 Cloning ${repoUrl} (${branch})...`);

  if (!repoUrl.startsWith("http") && !repoUrl.includes("://")) {
    repoUrl = `https://github.com/${repoUrl}.git`;
  }

  let cloneUrl = repoUrl;
  if (GITHUB_TOKEN && repoUrl.startsWith("https://github.com/")) {
    cloneUrl = repoUrl.replace("https://github.com/", `https://x-access-token:${GITHUB_TOKEN}@github.com/`);
  }

  await execAsync(`git clone --branch ${branch} --depth 1 ${cloneUrl} ${workspace}`, {
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });

  if (commitSha) {
    console.log(`  🔖 Checking out commit ${commitSha.slice(0, 7)}...`);
    await execAsync(`git fetch --depth 1 origin ${commitSha} && git checkout ${commitSha}`, {
      cwd: workspace,
    });
  }

  console.log(`  📦 Installing dependencies...`);
  try {
    await execAsync("npm install", { cwd: workspace, timeout: 120000 });
  } catch {
    console.log("  ⚠️  npm install failed — proceeding anyway");
  }

  return workspace;
}

// ── GitHub PR helper ────────────────────────────────────────────
async function openPR(repoUrl: string, branch: string, prBranch: string, prTitle: string, prBody: string): Promise<string | null> {
  if (!GITHUB_TOKEN) {
    console.log("  ⚠️  GITHUB_TOKEN not set — skipping PR creation");
    return null;
  }

  const match = repoUrl.replace(/\.git$/, "").match(/github\.com[:/]([^/]+)\/([^/]+)/);
  if (!match) {
    console.log("  ⚠️  Could not parse repo URL for PR");
    return null;
  }
  const [, owner, repo] = match;

  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${GITHUB_TOKEN}`,
      "Accept": "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({
      title: prTitle,
      body: prBody,
      head: prBranch,
      base: branch,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.log(`  ❌ Failed to open PR: ${err}`);
    return null;
  }

  const data: any = await res.json();
  console.log(`  ✅ PR created: ${data.html_url}`);
  return data.html_url;
}

// ── Health check ────────────────────────────────────────────────
app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    agents: ["researchTestAgent", "editorAgent"],
    workflows: ["testFixWorkflow"],
  });
});

// ── Consolidated generate-and-test endpoint ────────────────────
const generateAndTestHandler = async (req: Request, res: Response) => {
  if (!(await verifySignature(req))) {
    return res.status(401).json({ error: "Invalid signature" });
  }

  const { repoUrl, branch, commitSha, files, testType } = req.body;

  if (!repoUrl || !branch) {
    return res.status(400).json({ error: "repoUrl and branch are required" });
  }

  console.log(`\n🔔 Webhook received: generate-and-test for ${repoUrl}/${branch} (type: ${testType ?? "all"})`);

  let workspace: string | null = null;
  try {
    workspace = await cloneRepo(repoUrl, branch, commitSha);
    process.env.LEMON_WORKSPACE = workspace;
    console.log(`  📂 Working directory: ${workspace}`);

    const workflow = mastra.getWorkflow("testFixWorkflow");
    const result = await workflow.start({
      inputData: {
        repoPath: workspace,
        files: files ?? undefined,
        githubToken: GITHUB_TOKEN,
        githubRef: branch,
        githubSha: commitSha,
      },
    });

    const output = result?.output as { prUrl?: string | null } | undefined;
    console.log("\n✅ Test-fix workflow completed");

    // Collect changed files for the summary
    let changedFiles: string[] = [];
    try {
      const { stdout } = await execAsync("git diff --name-only HEAD", { cwd: workspace });
      changedFiles = stdout.trim().split("\n").filter(Boolean);
    } catch { /* ignore */ }

    res.json({
      status: "ok",
      repo: repoUrl,
      branch,
      commit: commitSha,
      prUrl: output?.prUrl ?? null,
      changedFiles,
    });
  } catch (err: any) {
    console.error("\n❌ Workflow execution failed:", err);
    res.status(500).json({
      status: "error",
      error: err.message,
      repo: repoUrl,
      branch,
      commit: commitSha,
    });
  } finally {
    if (workspace) {
      console.log(`  🧹 Cleaning up workspace: ${workspace}`);
      await rm(workspace, { recursive: true, force: true }).catch(() => {});
      delete process.env.LEMON_WORKSPACE;
    }
  }
};

app.post("/webhook/generate-and-test", generateAndTestHandler);
app.post("/webhook/test-and-fix", generateAndTestHandler);

// ── Start server ────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🍋 lemon.test webhook server running on port ${PORT}`);
  console.log(`   POST /webhook/generate-and-test  — full generate + run + fix loop`);
  console.log(`   POST /webhook/test-and-fix        — alias for /webhook/generate-and-test`);
  console.log(`   GET  /health                       — health check`);
});
