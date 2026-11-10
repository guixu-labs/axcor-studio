import { test, expect } from '@playwright/test';
import { _electron as electron, type ElectronApplication, type Page } from 'playwright';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test.describe('workspace tree', () => {
  let app: ElectronApplication;
  let window: Page;
  let workspaceDir: string;

  test.beforeAll(async () => {
    workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wb-e2e-ws-'));
    await fs.mkdir(path.join(workspaceDir, 'src'), { recursive: true });
    await fs.writeFile(path.join(workspaceDir, 'workflow.md'), '# E2E workflow\n\nSteps here.\n');
    await fs.writeFile(path.join(workspaceDir, 'src', 'main.ts'), 'export const value = 42;\n');
  });

  test.afterAll(async () => {
    await fs.rm(workspaceDir, { recursive: true, force: true });
  });

  test.beforeEach(async () => {
    app = await electron.launch({
      args: ['--no-sandbox', `--user-data-dir=${test.info().outputPath('profile')}`, path.resolve('.vite/build/main.js')],
      env: { ...process.env, EXECUTION_BACKEND_NO_AUTOSTART: '1', WORKBENCH_WORKSPACE: workspaceDir },
    });
    window = await app.firstWindow();
    window.on('pageerror', error => console.error(`[renderer:error] ${error.message}`));
    await window.waitForLoadState('domcontentloaded');
    await expect(window.locator('.app-shell')).toBeVisible({ timeout: 10_000 });
    await window.evaluate(() => localStorage.clear());
    await window.reload();
    await expect(window.locator('.app-shell')).toBeVisible({ timeout: 10_000 });
  });

  test.afterEach(async () => {
    if (app) await app.close();
  });

  test('opens the workspace tree on startup and opens non-markdown files', async () => {
    await expect(window.getByRole('button', { name: '工作台', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(window.getByRole('heading', { name: '文件', exact: true })).toBeVisible();
    // Top-level files and the src directory are all visible; the first markdown is active.
    await expect(window.locator('.file-entry', { hasText: 'src' })).toBeVisible();
    await expect(window.locator('.file-entry', { hasText: 'workflow.md' })).toBeVisible();
    await expect(window.locator('.monaco-editor')).toBeVisible({ timeout: 10_000 });
    await expect(window.locator('.view-lines', { hasText: 'E2E workflow' })).toBeVisible();
    // Expand the src directory and open the TypeScript file.
    await window.getByRole('button', { name: 'src', exact: true }).click();
    await window.locator('.file-entry', { hasText: 'main.ts' }).click();
    await expect(window.locator('.view-lines', { hasText: 'export const value = 42' })).toBeVisible();
    await expect(window.locator('.frontmatter-warn')).toBeHidden();
    // Switching back to markdown brings the declaration warning back.
    await window.locator('.file-entry', { hasText: 'workflow.md' }).click();
    await expect(window.locator('.frontmatter-warn')).toBeVisible();
  });

  test('rejects running a file that is not a workflow program before calling the backend', async () => {
    await window.locator('.rail-item', { hasText: '工作台' }).click();
    await expect(window.locator('.monaco-editor')).toBeVisible({ timeout: 10_000 });
    // workflow.md has no front matter declaration, so starting a run must
    // fail locally with the front matter message (the backend is unavailable).
    await window.locator('.rail-item', { hasText: '运行' }).click();
    await window.getByRole('button', { name: '运行工作流' }).click();
    await expect(window.locator('.run-list-error')).toContainText('front matter');
  });
});
