import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { ensureExecutionBackendRunning, isExecutionBackendReachable, stopExecutionBackendIfStarted } from '../src/executionBackend/lifecycle';
import { setBackendBaseUrl } from '../src/executionBackend/http';

const FAKE_SERVER = `
const http = require('http');
const args = process.argv.slice(2);
if (args[0] !== 'web' || !args.includes('--no-open')) process.exit(1);
const portIndex = args.indexOf('--port');
const port = Number(portIndex >= 0 ? args[portIndex + 1] : 18600);
const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'GET' && req.url === '/api/v1/runs') { res.end(JSON.stringify({ runs: [] })); return; }
  if (req.method === 'GET' && req.url === '/api/v1/sessions') { res.end(JSON.stringify([])); return; }
  res.statusCode = 404; res.end(JSON.stringify({ detail: 'nf' }));
});
server.listen(port, '127.0.0.1');
`;

async function freePort(): Promise<number> {
  const probe = http.createServer(() => {});
  await new Promise<void>(resolve => { probe.listen(0, '127.0.0.1', () => resolve()); });
  const port = (probe.address() as AddressInfo).port;
  await new Promise<void>(resolve => { probe.close(() => resolve()); });
  return port;
}

async function unreachable(url: string): Promise<boolean> {
  for (let i = 0; i < 20; i += 1) {
    if (!(await isExecutionBackendReachable(url))) return true;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  return false;
}

test('isExecutionBackendReachable', async t => {
  const server = http.createServer((req, res) => {
    if (req.url !== '/api/v1/runs') {
      res.setHeader('Content-Type', 'text/html');
      res.end('<html></html>');
      return;
    }
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ runs: [] }));
  });
  await new Promise<void>(resolve => { server.listen(0, '127.0.0.1', () => resolve()); });
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  t.after(() => server.close());

  await t.test('reports true for a healthy backend', async () => {
    assert.equal(await isExecutionBackendReachable(url), true);
  });

  await t.test('reports false for an unreachable backend', async () => {
    assert.equal(await isExecutionBackendReachable('http://127.0.0.1:1'), false);
  });

  await t.test('rejects an HTML response from the runs endpoint', async () => {
    assert.equal(await isExecutionBackendReachable(url + '/frontend'), false);
  });
});

test('execution backend lifecycle', async t => {
  const binDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wb-service-'));
  await fs.writeFile(path.join(binDir, 'fake-server.js'), FAKE_SERVER);
  await fs.writeFile(path.join(binDir, 'workflow-controller'), `#!/bin/sh\nexec node "${path.join(binDir, 'fake-server.js')}" "$@"\n`, { mode: 0o755 });
  const originalPath = process.env.PATH;
  t.after(async () => {
    stopExecutionBackendIfStarted();
    process.env.PATH = originalPath;
    await fs.rm(binDir, { recursive: true, force: true });
  });

  await t.test('stops the instance it started on quit', async () => {
    process.env.PATH = binDir + ':' + (process.env.PATH ?? '');
    const url = `http://127.0.0.1:${await freePort()}`;
    setBackendBaseUrl(url);
    assert.equal(await ensureExecutionBackendRunning(), true);
    assert.equal(await isExecutionBackendReachable(url), true);
    stopExecutionBackendIfStarted();
    assert.equal(await unreachable(url), true);
  });

  await t.test('leaves a reused instance running', async () => {
    const server = http.createServer((_req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ runs: [] }));
    });
    await new Promise<void>(resolve => { server.listen(0, '127.0.0.1', () => resolve()); });
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    setBackendBaseUrl(url);
    assert.equal(await ensureExecutionBackendRunning(), true);
    stopExecutionBackendIfStarted();
    assert.equal(await isExecutionBackendReachable(url), true);
    await new Promise<void>(resolve => { server.close(() => resolve()); });
  });
});
