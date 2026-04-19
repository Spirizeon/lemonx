import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const CLI_PATH = path.join(__dirname, '..', 'index.js');
const TEST_DIR = path.join(__dirname, 'test-workspace');

beforeAll(() => {
  fs.mkdirSync(TEST_DIR, { recursive: true });
  process.chdir(TEST_DIR);
});

afterAll(() => {
  process.chdir(__dirname);
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('GitHub Actions Setup Script', () => {
  it('creates workflow file and docker compose', () => {
    // Run the script
    execSync(`node ${CLI_PATH}`, { stdio: 'inherit' });

    // Verify workflow file
    expect(fs.existsSync('.github/workflows/ai-test-loop.yml')).toBe(true);
    expect(fs.readFileSync('.github/workflows/ai-test-loop.yml', 'utf-8')).toContain('name: AI Test Loop');

    // Verify docker compose file
    expect(fs.existsSync('lemon-compose.yml')).toBe(true);
    expect(fs.readFileSync('lemon-compose.yml', 'utf-8')).toContain('services:\n  redis:\n');

    // Verify README modifications
    expect(fs.existsSync('README.md')).toBe(true);
    const readmeContent = fs.readFileSync('README.md', 'utf-8');
    expect(readmeContent).toContain('## GitHub Actions – AI Test Loop');
    expect(readmeContent).toContain('CLOUDFLARE_ACCOUNT_ID');
  });
});
