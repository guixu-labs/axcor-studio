import { launchWorkbench, workbenchPage } from './launch';
import { test, expect } from '@playwright/test';
import { type ElectronApplication, type Page } from 'playwright';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test.describe('monaco editor', () => {
  let app: ElectronApplication;
  let window: Page;
  let workspaceDir: string;

  test.beforeAll(async () => {
    workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wb-editor-'));
    await fs.writeFile(path.join(workspaceDir, 'workflow.md'), '# New workflow\n');
    await fs.writeFile(path.join(workspaceDir, 'z-notes.md'), '# Notes\n');
  });

  test.afterAll(async () => {
    await fs.rm(workspaceDir, { recursive: true, force: true });
  });

  test.beforeEach(async () => {
    app = await launchWorkbench({
      args: ['--no-sandbox', `--user-data-dir=${test.info().outputPath('profile')}`],
      workspace: workspaceDir,
    });
    window = await workbenchPage(app);
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

  test('shows the file background when the last editor tab is closed', async () => {
    await expect(window.locator('.monaco-editor')).toBeVisible({ timeout: 10_000 });
    await window.getByRole('button', { name: '关闭 workflow.md', exact: true }).click();
    await expect(window.locator('.workspace-grid .empty-panel')).toBeVisible();
    await expect(window.getByRole('tab')).toHaveCount(0);
    await window.locator('.file-list').getByRole('button', { name: /workflow\.md/ }).click();
    await expect(window.locator('.view-lines', { hasText: 'New workflow' })).toBeVisible();
  });

  test('keeps the editor visible while toggling sidebars', async () => {
    const tabs = window.locator('.app-content').getByRole('tablist', { name: '已打开的标签页' });
    await expect(tabs.getByRole('tab', { name: 'workflow.md' })).toHaveAttribute('aria-selected', 'true');
    await window.locator('.monaco-editor').click();
    await window.keyboard.press('ControlOrMeta+a');
    await window.keyboard.type('# Preserved edit');
    const workspace = window.getByRole('button', { name: '工作台', exact: true });
    const explorer = window.locator('.workspace-explorer');
    const dividerX = await explorer.evaluate(node => node.getBoundingClientRect().left);
    const iconX = await workspace.evaluate(node => node.getBoundingClientRect().left);
    await workspace.click();
    await expect(explorer).toBeHidden();
    const collapsedEdge = await window.locator('.left-workbench').evaluate(node => node.getBoundingClientRect().right);
    expect(collapsedEdge).toBe(dividerX);
    expect(await workspace.evaluate(node => node.getBoundingClientRect().left)).toBe(iconX);
    await expect(workspace).not.toHaveAttribute('aria-current', 'page');
    await workspace.click();
    await expect(explorer).toBeVisible();
    const runs = window.getByRole('button', { name: '运行', exact: true });
    const runsPanel = window.locator('.runs-panel');
    await runs.click();
    await expect(runsPanel).toBeVisible();
    await runs.click();
    await expect(runsPanel).toBeHidden();
    await runs.click();
    await expect(runsPanel).toBeVisible();
    await expect(tabs.getByRole('tab')).toHaveCount(1);
    await expect(window.locator('.view-lines', { hasText: '# Preserved edit' })).toBeVisible();
    await window.getByRole('button', { name: '工作台', exact: true }).click();
    await expect(tabs.getByRole('tab', { name: 'workflow.md' })).toHaveAttribute('aria-selected', 'true');
    await expect(window.locator('.view-lines', { hasText: '# Preserved edit' })).toBeVisible();
  });

  test('prompts before closing an edited file and applies the selected action', async () => {
    const filePath = path.join(workspaceDir, 'workflow.md');
    const original = await fs.readFile(filePath, 'utf8');
    const tab = window.getByRole('tab', { name: 'workflow.md', exact: true });
    const close = window.getByRole('button', { name: '关闭 workflow.md', exact: true });
    const dialog = window.getByRole('dialog', { name: '是否保存对 workflow.md 的修改？' });
    const edit = async (text: string): Promise<void> => {
      await window.locator('.monaco-editor').click();
      await window.keyboard.press('ControlOrMeta+a');
      await window.keyboard.type(text);
      await expect(tab).toHaveAttribute('aria-description', '有未保存的修改');
    };

    await edit('# Discard this draft');
    await close.click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: '取消', exact: true }).click();
    await expect(tab).toBeVisible();
    await expect(window.locator('.view-lines')).toContainText('Discard this draft');
    await expect.poll(() => fs.readFile(filePath, 'utf8')).toBe(original);

    await close.click();
    await dialog.getByRole('button', { name: '不保存', exact: true }).click();
    await expect(tab).toHaveCount(0);
    await window.locator('.file-list').getByRole('button', { name: /workflow\.md/ }).click();
    await expect(window.locator('.view-lines')).toContainText(original.trim());

    await edit('# Save this draft');
    await close.click();
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    await expect(tab).toHaveCount(0);
    await expect.poll(() => fs.readFile(filePath, 'utf8')).toBe('# Save this draft');
    await fs.writeFile(filePath, original);
  });

  test('keeps edits with their file when switching tabs', async () => {
    await expect(window.locator('.monaco-editor')).toBeVisible({ timeout: 10_000 });
    await window.locator('.monaco-editor').click();
    await window.keyboard.press('ControlOrMeta+a');
    await window.keyboard.insertText('# Hello workflow');
    await expect(window.locator('.view-lines', { hasText: '# Hello workflow' })).toBeVisible();
    await window.locator('.file-list').getByRole('button', { name: /z-notes\.md/ }).click();
    await expect(window.locator('.view-lines', { hasText: '# Notes' })).toBeVisible();
    await window.locator('.monaco-editor').click();
    await window.keyboard.press('ControlOrMeta+a');
    await window.keyboard.insertText('# Edited notes');
    await window.getByRole('button', { name: '保存', exact: true }).click();
    await expect.poll(() => fs.readFile(path.join(workspaceDir, 'z-notes.md'), 'utf8')).toBe('# Edited notes');
    await window.getByRole('tab', { name: 'workflow.md', exact: true }).click();
    await expect(window.locator('.view-lines', { hasText: '# Hello workflow' })).toBeVisible();
  });
});
