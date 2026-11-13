import { launchWorkbench, workbenchPage } from './launch';
import { test, expect } from '@playwright/test';
import { type ElectronApplication, type Page } from 'playwright';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

const FAKE_BACKEND_SERVER = `
const http = require('http');
const args = process.argv.slice(2);
if (args.includes('--insight') || process.env.WORKFLOW_CONTROLLER_INSIGHT_PORT !== undefined) process.exit(2);
const portIndex = args.indexOf('--port');
const port = Number(portIndex >= 0 ? args[portIndex + 1] : 18600);
const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'GET' && req.url === '/api/v1/runs') {
    res.end(JSON.stringify({
      runs: [{
        run_id: 'auto-1',
        kind: 'container',
        format: '',
        status: 'running',
        program_ref: '',
        params: {},
        label: 'auto-started',
        work_dir: null,
        max_parallel: null,
        pause_reason: null,
        created_at: '2026-11-05T10:00:00+00:00',
        finished_at: null,
        reopened_at: null,
        error: null,
        member_count: 0,
        running_count: 0,
      }],
    }));
    return;
  }
  if (req.method === 'GET' && req.url === '/api/v1/sessions') { res.end(JSON.stringify([])); return; }
  res.statusCode = 404;
  res.end(JSON.stringify({ detail: 'nf' }));
});
server.listen(port, '127.0.0.1');
`;

test.describe('execution backend auto-start', () => {
  let app: ElectronApplication;
  let window: Page;
  let binDir: string;
  let backendPort: number;

  test.beforeAll(async () => {
    binDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wb-autostart-'));
    await fs.writeFile(path.join(binDir, 'fake-backend-server.js'), FAKE_BACKEND_SERVER);
    await fs.writeFile(
      path.join(binDir, 'workflow-controller'),
      `#!/bin/sh\nexec node "${path.join(binDir, 'fake-backend-server.js')}" "$@"\n`,
      { mode: 0o755 },
    );
    // Find a free port for the fake backend.
    const probe = http.createServer(() => {});
    await new Promise<void>(resolve => { probe.listen(0, '127.0.0.1', () => resolve()); });
    backendPort = (probe.address() as AddressInfo).port;
    await new Promise<void>(resolve => { probe.close(() => resolve()); });
  });

  test.afterAll(async () => {
    await fs.rm(binDir, { recursive: true, force: true });
  });

  test.beforeEach(async () => {
    const env = { ...process.env, PATH: binDir + path.delimiter + (process.env.PATH ?? '') };
    Reflect.deleteProperty(env, 'WORKFLOW_CONTROLLER_INSIGHT_PORT');
    app = await launchWorkbench({
      args: ['--no-sandbox', `--user-data-dir=${test.info().outputPath('profile')}`],
      executionUrl: `http://127.0.0.1:${backendPort}`,
      env,
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
    if (app) await app.close();
  });

  test('spawns the execution backend when the configured URL is not answering', async () => {
    await window.getByRole('button', { name: '运行', exact: true }).click();
    await expect(window.getByRole('option', { name: /auto-started/ })).toBeVisible({ timeout: 20_000 });
    await expect(window.locator('.run-list-error')).toHaveCount(0);
    // Quitting the workbench must stop the instance it started.
    await app.close();
    app = undefined as unknown as ElectronApplication;
    const url = `http://127.0.0.1:${backendPort}/api/v1/runs`;
    let stopped = false;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try { await fetch(url, { signal: AbortSignal.timeout(500) }); } catch { stopped = true; break; }
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    expect(stopped).toBe(true);
  });
});
