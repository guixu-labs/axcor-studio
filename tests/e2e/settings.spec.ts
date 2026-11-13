import { launchWorkbench, workbenchPage } from './launch';
import { test, expect } from '@playwright/test';
import { type ElectronApplication, type Page } from 'playwright';

test.describe('settings', () => {
  let app: ElectronApplication;
  let window: Page;

  test.beforeEach(async () => {
    app = await launchWorkbench({ args: ['--no-sandbox', `--user-data-dir=${test.info().outputPath('profile')}`] });
    app.process().stderr?.on('data', chunk => console.error(`[electron] ${chunk.toString().trim()}`));
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

  test('opens the settings dialog and persists theme and font selections', async () => {
    const nativeColorScheme = () => app.evaluate(({ nativeTheme }) => nativeTheme.themeSource);
    await expect.poll(nativeColorScheme).toBe('dark');
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

    await expect
      .poll(() => window.evaluate(() => JSON.parse(localStorage.getItem('workbench.theme') ?? 'null')))
      .toBe('github-light');
    await expect
      .poll(() => window.evaluate(() => JSON.parse(localStorage.getItem('workbench.font') ?? 'null')))
      .toBe('jetbrains-mono');
    await expect
      .poll(() => window.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--app-font')))
      .toContain('JetBrains Mono');
    await expect
      .poll(() =>
        window.evaluate(() =>
          getComputedStyle(document.querySelector('.app-shell') as HTMLElement).getPropertyValue('--surface-0'),
        ),
      )
      .toBe('#f6f8fa');
    await expect.poll(nativeColorScheme).toBe('light');

    await window.getByLabel('Theme').click();
    await window.getByRole('option', { name: 'GitHub Dark' }).click();
    await expect.poll(nativeColorScheme).toBe('dark');

    await window.getByRole('dialog', { name: 'Settings' }).getByRole('button', { name: 'Settings' }).click();
    await expect(window.getByRole('dialog', { name: /^(Settings|设置)$/ })).toBeHidden();
  });

  test('shares the image and theme color between empty file and run views', async () => {
    await window.evaluate(() => {
      localStorage.setItem('workbench.openFiles', JSON.stringify(['stale.md']));
      localStorage.setItem('workbench.activeFile', JSON.stringify('stale.md'));
    });
    await window.reload();
    const emptyPanel = window.locator('.empty-panel');
    await expect(window.locator('.workspace-grid .empty-panel')).toBeVisible();
    await expect(window.getByRole('tab')).toHaveCount(0);
    await expect(emptyPanel).toHaveCSS('background-image', 'none');
    await expect(emptyPanel).toHaveCSS('background-color', 'rgb(22, 27, 34)');

    await window.locator('.rail-settings').click();
    await window.getByLabel('主题', { exact: true }).click();
    await window.getByRole('option', { name: 'GitHub Light' }).click();
    await expect(emptyPanel).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    const image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1ioAAAAASUVORK5CYII=';
    await window.getByLabel('背景图', { exact: true }).setInputFiles({
      name: 'background.png',
      mimeType: 'image/png',
      buffer: Buffer.from(image, 'base64'),
    });
    const expectedImage = `url("data:image/png;base64,${image}")`;
    await expect(emptyPanel).toHaveCSS('background-image', expectedImage);
    await window.getByLabel('背景图显示方式').click();
    await window.getByRole('option', { name: '完整显示' }).click();
    await expect(emptyPanel).toHaveCSS('background-size', 'contain');
    await window.locator('.modal-close').click();

    await window.getByRole('button', { name: '运行', exact: true }).click();
    await expect(window.locator('.single-panel .empty-panel')).toBeVisible();
    await expect(emptyPanel).toHaveCSS('background-image', expectedImage);
    await expect(emptyPanel).toHaveCSS('background-size', 'contain');
    await window.locator('.rail-settings').click();
    await window.getByRole('button', { name: '移除', exact: true }).click();
    await expect(emptyPanel).toHaveCSS('background-image', 'none');
    await expect(emptyPanel).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  });
});
