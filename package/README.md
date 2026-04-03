# lemonx

A zero-dependency CLI that scaffolds a GitHub Actions AI test-fix loop workflow into your project, and updates your README with setup instructions.

## Usage

Run from the root of your project:

```bash
npx lemonx
```

## What it does

1. **Creates** `.github/workflows/ai-test-loop.yml` with an AI-powered test-fix loop workflow
2. **Updates** your `README.md` (or creates one) with:
   - Required GitHub repository secrets to set up
   - Step-by-step instructions for adding them
   - A description of what the workflow does

## Required secrets

Before pushing, add these to **Settings → Secrets and variables → Actions** in your GitHub repo:

| Secret | Description |
|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare Account ID |
| `CLOUDFLARE_API_KEY` | Your Cloudflare API Key |

## The generated workflow

The workflow triggers on every push and pull request to non-`main` branches and:

- Checks out your repository
- Verifies Docker and Docker Compose availability
- Runs `docker compose up --build` for the AI test-fix loop
- Cleans up all containers and volumes when done

## License

MIT

## ⚙️ GitHub Actions – AI Test Loop

This repo uses an **AI-powered test-fix loop** that runs automatically on every push and pull request (except `main`).

### 🔐 Required: Add Repository Secrets

Before pushing, you **must** add the following secrets to your GitHub repository, or the workflow will fail:

| Secret Name | Description |
|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare Account ID |
| `CLOUDFLARE_API_KEY` | Your Cloudflare API Key |

**How to add secrets:**
1. Go to your repository on GitHub
2. Navigate to **Settings → Secrets and variables → Actions**
3. Click **"New repository secret"**
4. Add each secret listed above

### 🚀 What it does

On every push/PR to a non-`main` branch, the workflow:
1. Checks out your repository
2. Verifies Docker and Docker Compose are available
3. Runs the AI test-fix loop via `docker compose up`
4. Cleans up containers and volumes after completion

The workflow file lives at `.github/workflows/ai-test-loop.yml`.
