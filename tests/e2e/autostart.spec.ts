import { test, expect } from '@playwright/test';
import { _electron as electron, type ElectronApplication, type Page } from 'playwright';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

const FAKE_OPSBOT_SERVER = `
const http = require('http');
const args = process.argv.slice(2);
const portIndex = args.indexOf('--port');
const port = Number(portIndex >= 0 ? args[portIndex + 1] : 18600);
const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'GET' && req.url === '/api/v1/runs') {
    res.end(JSON.stringify({ runs: [{ run_id: 'auto-1', kind: 'container', format: '', status: 'running', program_ref: '', params: {}, label: 'auto-started', work_dir: null, max_parallel: null, pause_reason: null, created_at: '2026-11-05T10:00:00+00:00', finished_at: null, reopened_at: null, error: null, member_count: 0, running_count: 0 }] }));
    return;
  }
  if (req.method === 'GET' && req.url === '/api/v1/sessions') { res.end(JSON.stringify([])); return; }
  res.statusCode = 404;
  res.end(JSON.stringify({ detail: 'nf' }));
});
server.listen(port, '127.0.0.1');
`;

test.describe('opsbot auto-start', () => {
  let app: ElectronApplication;
  let window: Page;
  let binDir: string;
  let opsbotPort: number;

  test.beforeAll(async () => {
    binDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wb-autostart-'));
    await fs.writeFile(path.join(binDir, 'fake-opsbot-server.js'), FAKE_OPSBOT_SERVER);
    await fs.writeFile(path.join(binDir, 'opsbot'), `#!/bin/sh\nexec node "${path.join(binDir, 'fake-opsbot-server.js')}" "$@"\n`, { mode: 0o755 });
    // Find a free port for the fake opsbot.
    const probe = http.createServer(() => {});
    await new Promise<void>(resolve => { probe.listen(0, '127.0.0.1', () => resolve()); });
    opsbotPort = (probe.address() as AddressInfo).port;
    await new Promise<void>(resolve => { probe.close(() => resolve()); });
  });

  test.afterAll(async () => {
    await fs.rm(binDir, { recursive: true, force: true });
  });

  test.beforeEach(async () => {
    app = await electron.launch({
      args: ['--no-sandbox', path.resolve('.vite/build/main.js')],
      env: { ...process.env, PATH: binDir + ':' + (process.env.PATH ?? ''), OPSBOT_BASE_URL: `http://127.0.0.1:${opsbotPort}` },
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

  test('spawns opsbot when the configured URL is not answering', async () => {
    // The main process probes, fails, spawns the fake opsbot via PATH and
    // the renderer retries until the run list arrives.
    await expect(window.getByRole('option', { name: /auto-started/ })).toBeVisible({ timeout: 20_000 });
    await expect(window.locator('.run-list-error')).toHaveCount(0);
    // Quitting the workbench must stop the instance it started.
    await app.close();
    app = undefined as unknown as ElectronApplication;
    const url = `http://127.0.0.1:${opsbotPort}/api/v1/runs`;
    let stopped = false;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try { await fetch(url, { signal: AbortSignal.timeout(500) }); } catch { stopped = true; break; }
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    expect(stopped).toBe(true);
  });
});
