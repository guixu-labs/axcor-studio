import { test, expect } from '@playwright/test';
import { _electron as electron, type ElectronApplication, type Page } from 'playwright';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

test.describe('run configuration', () => {
  let app: ElectronApplication;
  let window: Page;
  let workspaceDir: string;
  let opsbotUrl: string;
  let opsbotServer: http.Server;
  let capturedBodies: Record<string, unknown>[] = [];
  let postedLabel = 'workflow.md';

  test.beforeAll(async () => {
    workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wb-run-params-'));
    await fs.writeFile(path.join(workspaceDir, 'workflow.md'), '---\nformat: graph-yaml@1\n---\n\n# Program\n');
    opsbotServer = http.createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json');
      let raw = '';
      req.on('data', chunk => { raw += chunk; });
      req.on('end', () => {
        let body: Record<string, unknown> = {};
        try { body = raw ? JSON.parse(raw) as Record<string, unknown> : {}; } catch { /* keep empty */ }
        if (req.method === 'POST' && req.url === '/api/v1/runs') {
          capturedBodies.push(body);
          if (typeof body['label'] === 'string') postedLabel = body['label'];
          res.statusCode = 201;
          res.end(JSON.stringify({ run_id: 'run-params-1', status: 'running', format: 'graph-yaml@1', kind: 'workflow' }));
          return;
        }
        if (req.method === 'GET' && req.url === '/api/v1/runs') {
          res.end(JSON.stringify({ runs: [] }));
          return;
        }
        if (req.method === 'GET' && req.url?.startsWith('/api/v1/runs/run-params-1')) {
          const record = { run_id: 'run-params-1', kind: 'workflow', format: 'graph-yaml@1', status: 'running', program_ref: 'workflow.md', params: {}, label: postedLabel, work_dir: workspaceDir, max_parallel: null, pause_reason: null, created_at: '2026-11-03T12:00:00+00:00', finished_at: null, reopened_at: null, error: null, member_count: 0, running_count: 0 };
          if (req.url.includes('/events')) {
            res.end(JSON.stringify({ events: [], next_cursor: 'c', limit: 200 }));
          } else {
            res.end(JSON.stringify({ run: record, sessions: [] }));
          }
          return;
        }
        res.statusCode = 404;
        res.end(JSON.stringify({ detail: `unexpected ${req.method} ${req.url}` }));
      });
    });
    await new Promise<void>(resolve => { opsbotServer.listen(0, '127.0.0.1', () => resolve()); });
    opsbotUrl = `http://127.0.0.1:${(opsbotServer.address() as AddressInfo).port}`;
  });

  test.afterAll(async () => {
    opsbotServer.close();
    await fs.rm(workspaceDir, { recursive: true, force: true });
  });

  test.beforeEach(async () => {
    capturedBodies = [];
    app = await electron.launch({
      args: ['--no-sandbox', path.resolve('.vite/build/main.js')],
      env: { ...process.env, WORKBENCH_WORKSPACE: workspaceDir, OPSBOT_BASE_URL: opsbotUrl },
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

  test('starts a run with the configured runtime, label, params and max parallel', async () => {
    await window.locator('.rail-item', { hasText: '工作台' }).click();
    await expect(window.locator('.monaco-editor')).toBeVisible({ timeout: 10_000 });
    await window.locator('.rail-item', { hasText: '运行' }).click();
    await expect(window.getByLabel('运行时')).toHaveValue('opsbot');
    await window.getByLabel('运行名称').fill('release-check');
    await window.getByRole('button', { name: '添加参数' }).click();
    const rows = window.locator('.run-param-row');
    await rows.first().getByPlaceholder('键').fill('dataset');
    await rows.first().getByPlaceholder('值').fill('core');
    await window.getByLabel('最大并行数').fill('4');
    await window.getByRole('button', { name: '运行工作流' }).click();
    await expect(window.getByRole('option', { name: /release-check/ })).toBeVisible();
    await expect.poll(() => capturedBodies.length).toBe(1);
    expect(capturedBodies[0]['program_path']).toBe(path.join(workspaceDir, 'workflow.md'));
    expect(capturedBodies[0]['label']).toBe('release-check');
    expect(capturedBodies[0]['params']).toEqual({ dataset: 'core' });
    expect(capturedBodies[0]['max_parallel']).toBe(4);
  });
});
