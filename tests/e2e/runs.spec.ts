import { test, expect } from '@playwright/test';
import { _electron as electron, type ElectronApplication, type Page } from 'playwright';
import http from 'node:http';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

const runRecord = {
  run_id: 'run-a', kind: 'workflow', format: 'markdown', status: 'running',
  program_ref: 'workflow.md', params: {}, label: 'workflow.md', work_dir: '/tmp/ws',
  max_parallel: null, pause_reason: null, created_at: '2026-11-03T10:00:00+00:00',
  finished_at: null, reopened_at: null, error: null, member_count: 1, running_count: 1,
};

function startFixtureOpsbot(): Promise<{ url: string; close: () => void }> {
  let eventCursorSeen = false;
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'GET' && req.url === '/api/v1/runs') {
      res.end(JSON.stringify({ runs: [runRecord] }));
      return;
    }
    if (req.method === 'GET' && req.url === '/api/v1/runs/run-a') {
      res.end(JSON.stringify({ run: runRecord, sessions: [] }));
      return;
    }
    if (req.method === 'GET' && req.url?.startsWith('/api/v1/runs/run-a/events')) {
      const events = eventCursorSeen ? [] : [
        { id: 1, run_id: 'run-a', session_id: null, iteration: null, timestamp: '2026-11-03T10:00:01+00:00', event_type: 'session_state_changed', data: JSON.stringify({ state: 'running' }), source: 'run_events' },
        { id: 2, run_id: 'run-a', session_id: null, iteration: null, timestamp: '2026-11-03T10:00:02+00:00', event_type: 'step_finish', data: JSON.stringify({ step: 'plan' }), source: 'events' },
      ];
      eventCursorSeen = true;
      res.end(JSON.stringify({ events, next_cursor: 'cursor-1', limit: 200 }));
      return;
    }
    res.statusCode = 404;
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

test.describe('opsbot runs', () => {
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

  test('lists opsbot runs and streams events for the selected run', async () => {
    const entry = window.getByRole('option', { name: /workflow\.md/ });
    await expect(entry).toBeVisible();
    await entry.click();
    await expect(window.locator('.run-detail')).toContainText('run-a');
    await expect(window.locator('.event', { hasText: 'session_state_changed' })).toBeVisible({ timeout: 6_000 });
    await expect(window.locator('.event', { hasText: 'step_finish' })).toBeVisible();
  });

  test('shows a guard error when starting a run without a workspace', async () => {
    await window.getByRole('button', { name: '运行工作流' }).click();
    await expect(window.locator('.run-list-error')).toContainText('选择工作区');
  });

  test('reconnects when the opsbot URL is changed in settings', async () => {
    const defaultApp = await electron.launch({
      args: ['--no-sandbox', path.resolve('.vite/build/main.js')],
      // Point the app at an unreachable port so the boot-time list fails
      // deterministically, independent of any opsbot running on the host.
      env: { ...process.env, OPSBOT_BASE_URL: 'http://127.0.0.1:1' },
    });
    const defaultWindow = await defaultApp.firstWindow();
    await defaultWindow.waitForLoadState('domcontentloaded');
    await expect(defaultWindow.locator('.app-shell')).toBeVisible({ timeout: 10_000 });
    await expect(defaultWindow.locator('.run-list-error')).toContainText('无法连接 Opsbot');
    await defaultWindow.locator('.rail-settings').click();
    await defaultWindow.getByRole('button', { name: '常规' }).click();
    await defaultWindow.getByLabel('Opsbot 地址').fill(fixture.url);
    await defaultWindow.locator('.modal-close').click();
    await expect(defaultWindow.getByRole('option', { name: /workflow\.md/ })).toBeVisible();
    await defaultApp.close();
  });
});
