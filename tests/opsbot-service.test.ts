import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { ensureOpsbotRunning, isOpsbotReachable, stopOpsbotIfStarted } from '../src/opsbotService';
import { setOpsbotBaseUrl } from '../src/opsbotHttp';

const FAKE_SERVER = `
const http = require('http');
const args = process.argv.slice(2);
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
    if (!(await isOpsbotReachable(url))) return true;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  return false;
}

test('isOpsbotReachable', async t => {
  const server = http.createServer((_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ runs: [] }));
  });
  await new Promise<void>(resolve => { server.listen(0, '127.0.0.1', () => resolve()); });
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  t.after(() => server.close());

  await t.test('reports true for a healthy opsbot', async () => {
    assert.equal(await isOpsbotReachable(url), true);
  });

  await t.test('reports false for an unreachable opsbot', async () => {
    assert.equal(await isOpsbotReachable('http://127.0.0.1:1'), false);
  });
});

test('opsbot lifecycle', async t => {
  const binDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wb-service-'));
  await fs.writeFile(path.join(binDir, 'fake-server.js'), FAKE_SERVER);
  await fs.writeFile(path.join(binDir, 'opsbot'), `#!/bin/sh\nexec node "${path.join(binDir, 'fake-server.js')}" "$@"\n`, { mode: 0o755 });
  const originalPath = process.env.PATH;
  t.after(async () => {
    stopOpsbotIfStarted();
    process.env.PATH = originalPath;
    await fs.rm(binDir, { recursive: true, force: true });
  });

  await t.test('stops the instance it started on quit', async () => {
    process.env.PATH = binDir + ':' + (process.env.PATH ?? '');
    const url = `http://127.0.0.1:${await freePort()}`;
    setOpsbotBaseUrl(url);
    assert.equal(await ensureOpsbotRunning(), true);
    assert.equal(await isOpsbotReachable(url), true);
    stopOpsbotIfStarted();
    assert.equal(await unreachable(url), true);
  });

  await t.test('leaves a reused instance running', async () => {
    const server = http.createServer((_req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ runs: [] }));
    });
    await new Promise<void>(resolve => { server.listen(0, '127.0.0.1', () => resolve()); });
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    setOpsbotBaseUrl(url);
    assert.equal(await ensureOpsbotRunning(), true);
    stopOpsbotIfStarted();
    assert.equal(await isOpsbotReachable(url), true);
    await new Promise<void>(resolve => { server.close(() => resolve()); });
  });
});
