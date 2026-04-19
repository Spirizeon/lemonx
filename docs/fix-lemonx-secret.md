# Fix: Add LEMONX Secret for GitHub PAT Authentication

## Problem

The workflow was relying on `secrets.GITHUB_TOKEN` to create PRs via GitHub API. However, GitHub Actions automatically injects `GITHUB_TOKEN` into the container, which cannot be named starting with `GITHUB_` as a custom secret name in GitHub Actions.

## Solution

Introduced a new environment variable `LEMONX` that accepts a GitHub Personal Access Token (PAT) for authenticating PR creation via GitHub API.

### Changes Made

**1. `src/index.ts`**
- Changed `GITHUB_TOKEN` to use `process.env.LEMONX` first, falling back to `process.env.GITHUB_TOKEN`
- Added `checkRequiredEnvVars()` function to prompt for required secrets including `LEMONX`

**2. `package/lemon-compose.yml`**
- Changed `GITHUB_TOKEN` environment variable to `LEMONX`

**3. `package/.github/workflows/ai-test-loop.yml`**
- Added `LEMONX: ${{ secrets.LEMONX }}` to pass the PAT to the container
- Kept `GITHUB_TOKEN` for backwards compatibility

**4. `README.md`**
- Updated Quick Start section to "Add Cloudflare and PAT as Secrets"
- Added `LEMONX` to the secrets table with description

## Required Secrets

| Secret | Description |
|--------|-------------|
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID |
| `CLOUDFLARE_API_KEY` | Cloudflare API key |
| `LEMONX` | GitHub PAT with `repo` scope (for creating PRs) |

## How to Add

1. Go to your repo → **Settings** → **Secrets and variables** → **Actions**
2. Add each secret listed above

## Notes

- The PAT requires `repo` scope to create branches and PRs
- `GITHUB_TOKEN` is still supported as a fallback for backwards compatibility