import { test, expect } from '@playwright/test';
import { _electron as electron, type ElectronApplication, type Page } from 'playwright';
import http from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

const runRecord = {
  run_id: 'run-a', kind: 'workflow', format: 'markdown', status: 'completed',
  program_ref: 'workflow.md', params: {}, label: 'workflow.md', work_dir: '/tmp/ws',
  max_parallel: null, pause_reason: null, created_at: '2026-11-03T10:00:00+00:00',
  finished_at: '2026-11-03T10:05:00+00:00', reopened_at: null, error: null, member_count: 1, running_count: 0,
};
const otherRunRecord = { ...runRecord, run_id: 'run-b', label: 'Second run' };
const sessionRecord = { session_id: 'sess-1', role: 'executor', context: null, state: 'completed', stop_reason: null, in_flight: false };

function startFixtureBackend(): Promise<{ url: string; close: () => void }> {
  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/api/v1/sessions') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify([]));
      return;
    }
    if (req.method === 'GET' && req.url === '/api/v1/runs') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ runs: [runRecord, otherRunRecord] }));
      return;
    }
    if (req.method === 'GET' && (req.url === '/api/v1/runs/run-a' || req.url === '/api/v1/runs/run-b')) {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ run: req.url.endsWith('run-b') ? otherRunRecord : runRecord, sessions: [sessionRecord] }));
      return;
    }
    if (req.method === 'GET' && req.url?.match(/^\/api\/v1\/runs\/run-[ab]\/events/)) {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ events: [], next_cursor: 'cursor-1', limit: 200 }));
      return;
    }
    if (req.method === 'POST' && req.url?.startsWith('/api/v1/insight/import')) {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: true, sessionId: 'sdk-session', insightUrl: '/insight/run/solo:sdk-session', imported: true }));
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

async function insightLoaded(app: ElectronApplication, url: string): Promise<boolean> {
  return app.evaluate(({ webContents }, target) =>
    webContents.getAllWebContents().some(web => web.getURL() === target && !web.isLoadingMainFrame()), url);
}

test.describe('insight observability view', () => {
  let app: ElectronApplication;
  let page: Page;
  let fixture: { url: string; close: () => void };
  let insightOrigin: string;

  test.beforeAll(async () => {
    fixture = await startFixtureBackend();
  });

  test.afterAll(() => {
    fixture.close();
  });

  async function launch(backendUrl: string): Promise<void> {
    const reservation = http.createServer();
    await new Promise<void>(resolve => reservation.listen(0, '127.0.0.1', resolve));
    const { port } = reservation.address() as AddressInfo;
    await new Promise<void>(resolve => reservation.close(() => resolve()));
    insightOrigin = `http://127.0.0.1:${port}`;

    const binDir = test.info().outputPath('bin');
    await mkdir(binDir, { recursive: true });
    const script = `#!/usr/bin/env node
const http = require('node:http');
if (process.argv.length !== 2 || process.env.CONTEXT_NO_BROWSER !== '1') process.exit(1);
http.createServer((req, res) => {
  if (req.url === '/api/observe/data?pageSize=1') {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ items: [] }));
    return;
  }
  if (req.url === '/' || req.url === '/run/solo:sdk-session') {
    res.setHeader('Content-Type', 'text/html');
    res.end('<!doctype html><h1>CONTEXT INSIGHT FIXTURE</h1>');
    return;
  }
  res.writeHead(404).end();
}).listen(Number(process.env.CONTEXT_INSIGHT_PORT), '127.0.0.1');
`;
    await writeFile(path.join(binDir, 'context-insight'), script, { mode: 0o755 });
    app = await electron.launch({
      args: ['--no-sandbox', `--user-data-dir=${test.info().outputPath('profile')}`, path.resolve('.vite/build/main.js')],
      env: {
        ...process.env,
        PATH: [binDir, process.env.PATH].join(path.delimiter),
        EXECUTION_BACKEND_NO_AUTOSTART: '1',
        EXECUTION_BACKEND_BASE_URL: backendUrl,
        CONTEXT_INSIGHT_PORT: String(port),
        CONTEXT_INSIGHT_NO_AUTOSTART: '0',
      },
    });
    page = await app.firstWindow();
    page.on('pageerror', error => console.error(`[renderer:error] ${error.message}`));
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('.app-shell')).toBeVisible({ timeout: 10_000 });
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(page.locator('.app-shell')).toBeVisible({ timeout: 10_000 });
  }

  test.afterEach(async () => {
    if (app) {
      await app.close();
      await expect.poll(() => fetch(insightOrigin).then(() => true, () => false)).toBe(false);
    }
  });

  test('opens the insight session view for a completed run', async () => {
    await launch(fixture.url);
    await page.getByRole('button', { name: '运行', exact: true }).click();
    await page.getByRole('option', { name: /Second run/ }).click();
    await page.getByRole('option', { name: /workflow\.md/ }).click();
    await page.getByRole('button', { name: '在 Insight 中查看' }).click();
    await expect.poll(() => insightLoaded(app, insightOrigin + '/run/solo:sdk-session')).toBe(true);
    await expect(page.locator('.insight-pane')).toBeVisible();
    const tabs = page.getByRole('tablist', { name: '已打开的标签页', exact: true });
    await expect(tabs.getByRole('tab')).toHaveCount(3);
    await tabs.getByRole('tab', { name: 'workflow.md', exact: true }).click();
    await expect(page.getByRole('tabpanel', { name: 'workflow.md' })).toBeVisible();
    await tabs.getByRole('tab', { name: 'Second run', exact: true }).click();
    await expect(page.getByRole('tabpanel', { name: 'Second run' })).toBeVisible();
    await page.locator('.rail-item', { hasText: '观测' }).click();
    await expect(tabs.getByRole('tab')).toHaveCount(3);
    await expect.poll(() => insightLoaded(app, insightOrigin + '/run/solo:sdk-session')).toBe(true);
    await tabs.getByRole('button', { name: '关闭 观测', exact: true }).click();
    await expect(page.getByRole('tabpanel', { name: 'workflow.md' })).toBeVisible();
  });

  test('starts and stops Context Insight without an execution backend', async () => {
    await launch('http://127.0.0.1:0');
    await page.locator('.rail-item', { hasText: '观测' }).click();
    await expect.poll(() => insightLoaded(app, insightOrigin + '/')).toBe(true);
    const status = await page.evaluate(() => window.executionBackend.insightStatus());
    expect(status).toEqual({ running: true, port: Number(new URL(insightOrigin).port) });
  });
});
