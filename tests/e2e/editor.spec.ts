import { test, expect } from '@playwright/test';
import { _electron as electron, type ElectronApplication, type Page } from 'playwright';
import path from 'node:path';

test.describe('monaco editor', () => {
  let app: ElectronApplication;
  let window: Page;

  test.beforeEach(async () => {
    app = await electron.launch({ args: ['--no-sandbox', `--user-data-dir=${test.info().outputPath('profile')}`, path.resolve('.vite/build/main.js')], env: { ...process.env, EXECUTION_BACKEND_NO_AUTOSTART: '1' } });
    window = await app.firstWindow();
    window.on('console', message => console.log(`[renderer:${message.type()}] ${message.text()}`));
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

  test('renders monaco in the workbench view and flags a missing program declaration', async () => {
    await window.locator('.rail-item', { hasText: '工作台' }).click();
    await expect(window.locator('.monaco-editor')).toBeVisible({ timeout: 10_000 });
    await expect(window.locator('.frontmatter-warn')).toBeVisible();
    await expect(window.locator('.frontmatter-warn')).toHaveAttribute('title', /front matter/);
  });

  test('edits propagate to the editor and a format declaration clears the warning', async () => {
    await window.locator('.rail-item', { hasText: '工作台' }).click();
    await expect(window.locator('.monaco-editor')).toBeVisible({ timeout: 10_000 });
    await window.locator('.monaco-editor').click();
    await window.keyboard.press('ControlOrMeta+a');
    await window.keyboard.type('---');
    await window.keyboard.press('Enter');
    await window.keyboard.type('format: graph-yaml@1');
    await window.keyboard.press('Enter');
    await window.keyboard.type('---');
    await window.keyboard.press('Enter');
    await window.keyboard.type('# Hello workflow');
    await expect(window.locator('.view-lines', { hasText: 'format: graph-yaml@1' })).toBeVisible();
    await expect(window.locator('.view-lines', { hasText: '# Hello workflow' })).toBeVisible();
    await expect(window.locator('.frontmatter-warn')).toBeHidden();
  });
});
