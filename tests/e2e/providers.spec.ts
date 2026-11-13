import { launchWorkbench, workbenchPage } from './launch';
import { test, expect } from '@playwright/test';
import { type ElectronApplication, type Page } from 'playwright';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

test.describe('provider settings', () => {
  let app: ElectronApplication;
  let window: Page;
  let executionBackendUrl: string;
  let backendServer: http.Server;
  let captured: Array<{ method: string; url: string; body: Record<string, unknown> }> = [];
  let finishCandidateTest: ((result: { success: boolean; error?: string }) => void) | undefined;

  function respondToCandidateTest(result: { success: boolean; error?: string }): void {
    finishCandidateTest?.(result);
    finishCandidateTest = undefined;
  }

  test.beforeAll(async () => {
    backendServer = http.createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json');
      let raw = '';
      req.on('data', chunk => {
        raw += chunk;
      });
      req.on('end', () => {
        let body: Record<string, unknown> = {};
        try {
          body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
        } catch {
          /* keep empty */
        }
        const record = (): void => {
          captured.push({ method: req.method ?? '', url: req.url ?? '', body });
        };
        if (req.method === 'GET' && req.url === '/api/v1/auth/keys') {
          res.end(
            JSON.stringify({
              keys: [
                {
                  key: 'sk-abc123',
                  masked: 'sk-a*****3',
                  provider_index: 0,
                  model: 'claude-sonnet-4-6',
                  base_url: 'https://api.example.com',
                  runtime: 'claude_sdk',
                  worker_validation: {
                    capability: 'worker/claude_sdk',
                    status: 'valid',
                    checked_at: '2026-11-04T20:00:00',
                    error: '',
                  },
                },
              ],
            }),
          );
          return;
        }
        if (req.method === 'POST' && req.url === '/api/v1/auth/keys') {
          record();
          res.end(JSON.stringify({ ok: true }));
          return;
        }
        if (req.method === 'DELETE' && req.url?.startsWith('/api/v1/auth/keys/')) {
          record();
          res.end(JSON.stringify({ ok: true }));
          return;
        }
        if (req.method === 'POST' && req.url === '/api/v1/auth/activate') {
          record();
          res.end(JSON.stringify({ ok: true, active_index: 0 }));
          return;
        }
        if (req.method === 'POST' && req.url === '/api/v1/auth/test-key') {
          record();
          finishCandidateTest = result => res.end(JSON.stringify(result));
          return;
        }
        if (req.method === 'POST' && req.url?.startsWith('/api/v1/auth/keys/') && req.url.endsWith('/test')) {
          record();
          res.end(JSON.stringify({ success: true }));
          return;
        }
        if (req.method === 'GET' && req.url === '/api/v1/runs') {
          res.end(JSON.stringify({ runs: [] }));
          return;
        }
        if (req.method === 'GET' && req.url === '/api/v1/sessions') {
          res.end(JSON.stringify([]));
          return;
        }
        res.statusCode = 404;
        res.end(JSON.stringify({ detail: `unexpected ${req.method} ${req.url}` }));
      });
    });
    await new Promise<void>(resolve => {
      backendServer.listen(0, '127.0.0.1', () => resolve());
    });
    executionBackendUrl = `http://127.0.0.1:${(backendServer.address() as AddressInfo).port}`;
  });

  test.afterAll(() => {
    backendServer.close();
  });

  test.beforeEach(async () => {
    captured = [];
    finishCandidateTest = undefined;
    app = await launchWorkbench({
      args: ['--no-sandbox', `--user-data-dir=${test.info().outputPath('profile')}`],
      executionUrl: executionBackendUrl,
    });
    window = await workbenchPage(app);
    window.on('pageerror', error => console.error(`[renderer:error] ${error.message}`));
    await window.waitForLoadState('domcontentloaded');
    await expect(window.locator('.app-shell')).toBeVisible({ timeout: 10_000 });
    await window.evaluate(() => localStorage.clear());
    await window.reload();
    await expect(window.locator('.app-shell')).toBeVisible({ timeout: 10_000 });
  });

  test.afterEach(async () => {
    respondToCandidateTest({ success: false });
    if (app) await app.close();
  });

  test('lists, adds, activates and deletes providers from settings', async () => {
    await window.locator('.rail-settings').click();
    await window.getByRole('button', { name: '模型供应商' }).click();
    const card = window.locator('.provider-card');
    const cardHead = card.locator('.provider-card-head');
    await expect(card).toHaveCount(1);
    await expect(cardHead).toContainText('Claude SDK · claude-sonnet-4-6');
    await expect(cardHead).toContainText('校验通过');
    await expect(card).not.toContainText('sk-a*****3');
    await cardHead.click();
    await expect(card.locator('.provider-meta > span')).toHaveText([
      '地址：https://api.example.com',
      'API 密钥：sk-a*****3',
    ]);
    await card.getByLabel('显示名称').fill('常用供应商');
    await card.getByRole('button', { name: '保存', exact: true }).click();
    await expect(cardHead).toContainText('常用供应商');
    await window.reload();
    await window.locator('.rail-settings').click();
    await window.getByRole('button', { name: '模型供应商' }).click();
    await expect(cardHead).toContainText('常用供应商');
    // Test the candidate form.
    const runtime = window.locator('.providers-form').getByRole('button', { name: '运行时', exact: true });
    await runtime.click();
    await expect(window.getByRole('option', { name: 'Claude SDK', selected: true })).toBeFocused();
    await window.keyboard.press('Escape');
    await expect(runtime).toBeFocused();
    await expect(window.getByRole('listbox', { name: '运行时' })).toBeHidden();
    await window.keyboard.press('ArrowDown');
    await expect(window.getByRole('option', { name: 'Claude SDK', selected: true })).toBeFocused();
    await window.keyboard.press('ArrowDown');
    await window.keyboard.press('Enter');
    await expect(runtime).toHaveText(/Claude CLI/);
    await window.getByLabel('API 密钥').fill('sk-new-key');
    await window.getByRole('textbox', { name: '模型', exact: true }).fill('claude-opus-4-6');
    await window.getByLabel('地址').fill('https://other.example.com');
    const form = window.locator('.providers-form');
    const originalCardY = (await card.boundingBox())?.y;
    await form.getByRole('button', { name: '测试', exact: true }).click();
    await expect(form.getByRole('button', { name: '测试中…' })).toBeDisabled();
    await expect(form.getByRole('button', { name: '添加', exact: true })).toBeDisabled();
    await expect.poll(() => Boolean(finishCandidateTest)).toBe(true);
    respondToCandidateTest({ success: false, error: 'Invalid API key' });
    await expect(form.getByRole('alert')).toHaveText('测试失败：Invalid API key');
    expect((await card.boundingBox())?.y).toBe(originalCardY);
    await form.getByRole('button', { name: '测试', exact: true }).click();
    await expect.poll(() => Boolean(finishCandidateTest)).toBe(true);
    respondToCandidateTest({ success: true });
    const candidateStatus = form.getByRole('status');
    await expect(candidateStatus).toContainText('测试通过');
    await expect(candidateStatus).toHaveCSS('text-align', 'end');
    const [testBox, addBox, statusBox] = await Promise.all([
      form.getByRole('button', { name: '测试', exact: true }).boundingBox(),
      form.getByRole('button', { name: '添加', exact: true }).boundingBox(),
      candidateStatus.boundingBox(),
    ]);
    expect(testBox!.x).toBeLessThan(addBox!.x);
    expect(addBox!.x).toBeLessThan(statusBox!.x);
    expect((await card.boundingBox())?.y).toBe(originalCardY);
    // Add and save the provider list.
    await window.getByRole('button', { name: '添加', exact: true }).click();
    await expect
      .poll(() => captured.some(request => request.method === 'POST' && request.url === '/api/v1/auth/keys'))
      .toBe(true);
    const save = captured.find(request => request.method === 'POST' && request.url === '/api/v1/auth/keys');
    expect((save?.body.keys as Array<Record<string, unknown>>).length).toBe(2);
    expect((save?.body.keys as Array<Record<string, unknown>>)[1].key).toBe('sk-new-key');
    expect((save?.body.keys as Array<Record<string, unknown>>)[1].runtime).toBe('claude_cli');
    await expect(form.getByRole('status')).toContainText('供应商已保存');
    expect((await card.boundingBox())?.y).toBe(originalCardY);
    // Expand the first card and activate the provider.
    await window.locator('.provider-card').first().locator('.provider-card-head').click();
    const cardBeforeTest = await card.boundingBox();
    const cardActions = card.locator('.provider-actions').getByRole('button');
    const buttonSizes = await cardActions.evaluateAll(buttons =>
      buttons.map(button => {
        const { width, height } = button.getBoundingClientRect();
        return { width, height };
      }),
    );
    expect(buttonSizes).toEqual(Array(3).fill(buttonSizes[0]));
    await card.getByRole('button', { name: '测试', exact: true }).click();
    await expect(card.getByRole('status')).toContainText('测试通过');
    expect(await card.boundingBox()).toEqual(cardBeforeTest);
    await window.locator('.provider-card').first().getByRole('button', { name: '使用' }).click();
    await expect.poll(() => captured.some(request => request.url === '/api/v1/auth/activate')).toBe(true);
    expect(captured.find(request => request.url === '/api/v1/auth/activate')?.body.index).toBe(0);
    await expect(card.locator('.provider-chip-active')).toBeVisible();
    await expect(card.getByRole('status')).toBeEmpty();
    // Delete the first provider.
    await card.getByRole('button', { name: '删除', exact: true }).click();
    await expect.poll(() => captured.some(request => request.method === 'DELETE')).toBe(true);
  });
});
