import { test, expect } from '@playwright/test';
import { _electron as electron, type ElectronApplication, type Page } from 'playwright';
import http from 'node:http';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

const runRecord = {
  run_id: 'run-a', kind: 'workflow', format: 'markdown', status: 'completed',
  program_ref: 'workflow.md', params: {}, label: 'workflow.md', work_dir: '/tmp/ws',
  max_parallel: null, pause_reason: null, created_at: '2026-11-03T10:00:00+00:00',
  finished_at: '2026-11-03T10:05:00+00:00', reopened_at: null, error: null, member_count: 1, running_count: 0,
};
const sessionRecord = { session_id: 'sess-1', role: 'executor', context: null, state: 'completed', stop_reason: null, in_flight: false };

function startFixtureOpsbot(): Promise<{ url: string; close: () => void }> {
  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/api/v1/runs') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ runs: [runRecord] }));
      return;
    }
    if (req.method === 'GET' && req.url === '/api/v1/runs/run-a') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ run: runRecord, sessions: [sessionRecord] }));
      return;
    }
    if (req.method === 'GET' && req.url?.startsWith('/api/v1/runs/run-a/events')) {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ events: [], next_cursor: 'cursor-1', limit: 200 }));
      return;
    }
    if (req.method === 'POST' && req.url?.startsWith('/api/v1/insight/import')) {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: true, sessionId: 'sess-1', insightUrl: '/insight/session/sess-1', imported: true }));
      return;
    }
    if (req.method === 'GET' && req.url?.startsWith('/insight/')) {
      res.setHeader('Content-Type', 'text/html');
      if (req.url.includes('/insight/session/sess-1')) {
        res.end('<!doctype html><html><body><h1>INSIGHT FIXTURE SESSION PAGE</h1></body></html>');
      } else {
        res.end('<!doctype html><html><body><h1>INSIGHT FIXTURE HOME</h1></body></html>');
      }
      return;
    }
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ detail: `unexpected ${req.method} ${req.url}` }));
  });
  server.listen(0, '127.0.0.1');
  return new Promise(resolve => {
    server.once('listening', () => {
      const address = server.address() as AddressInfo;
      resolve({ url: `http://127.0.0.1:${address.port}`, close: () => server.close() });
    });
  });
}

async function insightUrl(app: ElectronApplication, needle: string): Promise<string> {
  return app.evaluate(({ webContents }, target) => {
    const urls = webContents.getAllWebContents().map(web => web.getURL());
    return urls.find(url => url.includes(target)) ?? '';
  }, needle);
}

test.describe('insight observability view', () => {
  let app: ElectronApplication;
  let window: Page;
  let fixture: { url: string; close: () => void };

  test.beforeAll(async () => {
    fixture = await startFixtureOpsbot();
  });

  test.afterAll(() => {
    fixture.close();
  });

  test.beforeEach(async () => {
    app = await electron.launch({
      args: ['--no-sandbox', path.resolve('.vite/build/main.js')],
      env: { ...process.env, OPSBOT_BASE_URL: fixture.url },
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

  test('opens the insight session view for a completed run', async () => {
    await window.getByRole('option', { name: /workflow\.md/ }).click();
    await window.getByRole('button', { name: '在 Insight 中查看' }).click();
    await expect.poll(() => insightUrl(app, '/insight/session/sess-1')).toContain('/insight/session/sess-1');
    const insightPage = app.windows().find(page => page.url().includes('/insight/session/sess-1'));
    if (insightPage) {
      await expect(insightPage.locator('h1')).toContainText('INSIGHT FIXTURE SESSION PAGE');
    }
    await expect(window.locator('.insight-pane')).toBeVisible();
  });

  test('opens the insight home from the navigation rail', async () => {
    await window.locator('.rail-item', { hasText: '观测' }).click();
    await expect.poll(() => insightUrl(app, '/insight/')).toBeTruthy();
    const insightPage = app.windows().find(page => page.url().endsWith('/insight/'));
    if (insightPage) {
      await expect(insightPage.locator('h1')).toContainText('INSIGHT FIXTURE HOME');
    }
  });
});
