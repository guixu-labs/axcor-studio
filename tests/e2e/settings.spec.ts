import { test, expect } from '@playwright/test';
import { _electron as electron, type ElectronApplication, type Page } from 'playwright';
import path from 'node:path';

test.describe('settings', () => {
  let app: ElectronApplication;
  let window: Page;

  test.beforeEach(async () => {
    app = await electron.launch({ args: ['--no-sandbox', path.resolve('.vite/build/main.js')], env: { ...process.env, OPSBOT_NO_AUTOSTART: '1' } });
    app.process().stderr?.on('data', chunk => console.error(`[electron] ${chunk.toString().trim()}`));
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

  test('opens the settings dialog and persists theme and font selections', async () => {
    await window.getByRole('button', { name: /^(Settings|设置)$/ }).click();
    await expect(window.getByRole('dialog', { name: /^(Settings|设置)$/ })).toBeVisible();

    await window.getByRole('button', { name: /^(常规|General)$/ }).click();
    await window.getByLabel('语言').click();
    await window.getByRole('option', { name: 'English' }).click();
    await expect(window.getByRole('dialog', { name: 'Settings' })).toContainText('Appearance');
    await window.getByRole('button', { name: 'Appearance' }).click();
    await window.getByLabel('Theme').click();
    await window.getByRole('option', { name: /GitHub Light/ }).click();
    await window.getByLabel('Editor font').click();
    await window.getByRole('option', { name: 'JetBrains Mono' }).click();

    await expect.poll(() => window.evaluate(() => JSON.parse(localStorage.getItem('workbench.theme') ?? 'null'))).toBe('github-light');
    await expect.poll(() => window.evaluate(() => JSON.parse(localStorage.getItem('workbench.font') ?? 'null'))).toBe('jetbrains-mono');
    await expect.poll(() => window.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--app-font'))).toContain('JetBrains Mono');
    await expect.poll(() => window.evaluate(() => getComputedStyle(document.querySelector('.app-shell') as HTMLElement).getPropertyValue('--surface-0'))).toBe('#f6f8fa');

    await window.getByRole('dialog', { name: 'Settings' }).getByRole('button', { name: 'Settings' }).click();
    await expect(window.getByRole('dialog', { name: /^(Settings|设置)$/ })).toBeHidden();
  });
});
