#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const WORKFLOW_YML = `name: AI Test Loop

on:
  push:
    branches-ignore: [main]
  pull_request:
    branches-ignore: [main]

jobs:
  ai-test-fix:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Set up Docker Compose
        run: |
          echo "Docker available: \$(docker --version)"
          echo "Docker Compose available: \$(docker compose version)"

      - name: Run AI test-fix loop
        env:
          CLOUDFLARE_ACCOUNT_ID: \${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          CLOUDFLARE_API_KEY: \${{ secrets.CLOUDFLARE_API_KEY }}
        run: |
          docker compose -f lemon-compose.yml up --build --abort-on-container-exit --exit-code-from lemon

      - name: Cleanup
        if: always()
        run: docker compose -f lemon-compose.yml down -v
`;

const DOCKER_COMPOSE_YML = `services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  lemon:
    image: delcagox/lemonx:latest
    depends_on:
      redis:
        condition: service_healthy
    environment:
      - CLOUDFLARE_ACCOUNT_ID=\${CLOUDFLARE_ACCOUNT_ID}
      - CLOUDFLARE_API_KEY=\${CLOUDFLARE_API_KEY}
      - REDIS_HOST=redis
      - REDIS_PORT=6379
    stop_grace_period: 5s

volumes:
  redis_data: 
`;

const SETUP_NOTICE = `
## GitHub Actions – AI Test Loop

This repo uses an AI-powered test-fix loop that runs automatically on every push and pull request (except \`main\`).

### Required: Add Repository Secrets

Before pushing, you must add the following secrets to your GitHub repository, or the workflow will fail:

| Secret Name | Description |
|---|---|
| \`CLOUDFLARE_ACCOUNT_ID\` | Your Cloudflare Account ID |
| \`CLOUDFLARE_API_KEY\` | Your Cloudflare API Key |

**How to add secrets:**
1. Go to your repository on GitHub
2. Navigate to **Settings -> Secrets and variables -> Actions**
3. Click **"New repository secret"**
4. Add each secret listed above

### What it does

On every push/PR to a non-\`main\` branch, the workflow:
1. Checks out your repository
2. Verifies Docker and Docker Compose are available
3. Runs the AI test-fix loop via \`docker compose up\`
4. Cleans up containers and volumes after completion

The workflow file lives at \`.github/workflows/ai-test-loop.yml\`.
`;

function getReadmePath(cwd) {
  const candidates = ["README.md", "readme.md", "Readme.md", "README.MD"];
  for (const name of candidates) {
    const p = path.join(cwd, name);
    if (fs.existsSync(p)) return p;
  }
  return path.join(cwd, "README.md"); // default to create
}

function run() {
  const cwd = process.cwd();

  console.log("\nlemonx\n");

  // 1. Create .github/workflows directory
  const workflowDir = path.join(cwd, ".github", "workflows");
  fs.mkdirSync(workflowDir, { recursive: true });
  console.log("Created .github/workflows/");

  // 2. Write the workflow file
  const workflowPath = path.join(workflowDir, "ai-test-loop.yml");
  fs.writeFileSync(workflowPath, WORKFLOW_YML, "utf8");
  console.log("Written .github/workflows/ai-test-loop.yml");

  // 3. Write docker-compose file
  const composePath = path.join(cwd, "lemon-compose.yml");
  fs.writeFileSync(composePath, DOCKER_COMPOSE_YML, "utf8");
  console.log("Written lemon-compose.yml");

  // 4. Update or create README
  const readmePath = getReadmePath(cwd);
  const readmeExists = fs.existsSync(readmePath);

  if (readmeExists) {
    const existing = fs.readFileSync(readmePath, "utf8");

    // Avoid duplicate injection
    if (existing.includes("AI Test Loop")) {
      console.log("README already contains AI Test Loop section — skipping update.");
    } else {
      fs.writeFileSync(readmePath, existing.trimEnd() + "\n\n" + SETUP_NOTICE.trim() + "\n", "utf8");
      console.log(`Appended setup instructions to ${path.basename(readmePath)}`);
    }
  } else {
    // Create a fresh README
    const projectName = path.basename(cwd);
    const freshReadme = `# ${projectName}\n${SETUP_NOTICE.trim()}\n`;
    fs.writeFileSync(readmePath, freshReadme, "utf8");
    console.log("Created README.md with setup instructions");
  }

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Done. Next steps:

  1. Add your secrets to GitHub:
     - CLOUDFLARE_ACCOUNT_ID
     - CLOUDFLARE_API_KEY

     Settings -> Secrets and variables -> Actions

  2. Commit and push:
     git add .github/workflows/ai-test-loop.yml lemon-compose.yml README.md
     git commit -m "chore: add AI test loop workflow"
     git push

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
}

run();