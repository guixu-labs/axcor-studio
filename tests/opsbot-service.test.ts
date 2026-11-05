import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { isOpsbotReachable } from '../src/opsbotService';

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
