import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  getOpsbotRun,
  listOpsbotRuns,
  setOpsbotBaseUrl,
  startOpsbotRun,
  stopOpsbotRun,
} from '../src/opsbotHttp';
import { OpsbotApiError } from '../src/shared/opsbotApi';

interface CapturedRequest {
  method: string;
  url: string;
  body: Record<string, unknown>;
}

function createFixtureServer(): { server: http.Server; baseUrl: string; requests: CapturedRequest[] } {
  const requests: CapturedRequest[] = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      let body: Record<string, unknown> = {};
      try { body = raw ? JSON.parse(raw) as Record<string, unknown> : {}; } catch { /* keep empty */ }
      requests.push({ method: req.method ?? '', url: req.url ?? '', body });
      res.setHeader('Content-Type', 'application/json');
      if (req.method === 'POST' && req.url === '/api/v1/runs') {
        res.statusCode = 201;
        res.end(JSON.stringify({ run_id: 'run-1', status: 'running', format: 'markdown', kind: 'workflow' }));
        return;
      }
      if (req.method === 'GET' && req.url === '/api/v1/runs') {
        res.end(JSON.stringify({ runs: [
          { run_id: 'run-1', kind: 'workflow', format: 'markdown', status: 'running', program_ref: 'workflow.md', params: {}, label: 'workflow.md', work_dir: '/tmp/ws', max_parallel: null, pause_reason: null, created_at: '2026-11-03T10:00:00+00:00', finished_at: null, reopened_at: null, error: null, member_count: 1, running_count: 1 },
          { run_id: 'run-2', kind: 'workflow', format: 'markdown', status: 'stopped', program_ref: '', params: {}, label: null, work_dir: null, max_parallel: null, pause_reason: null, created_at: '2026-11-03T09:00:00+00:00', finished_at: '2026-11-03T09:30:00+00:00', reopened_at: null, error: null, member_count: 0, running_count: 0 },
        ] }));
        return;
      }
      if (req.method === 'GET' && req.url === '/api/v1/runs/run-1') {
        res.end(JSON.stringify({ run: { run_id: 'run-1', kind: 'workflow', format: 'markdown', status: 'running', program_ref: 'workflow.md', params: {}, label: 'workflow.md', work_dir: '/tmp/ws', max_parallel: null, pause_reason: null, created_at: '2026-11-03T10:00:00+00:00', finished_at: null, reopened_at: null, error: null, member_count: 1, running_count: 1 }, sessions: [] }));
        return;
      }
      if (req.method === 'POST' && req.url === '/api/v1/runs/run-1/stop') {
        res.end(JSON.stringify({ run_id: 'run-1', status: 'stopped', accepted: true }));
        return;
      }
      if (req.method === 'GET' && req.url === '/api/v1/runs/missing') {
        res.statusCode = 404;
        res.end(JSON.stringify({ detail: 'run 不在账面：missing' }));
        return;
      }
      res.statusCode = 404;
      res.end(JSON.stringify({ detail: `unexpected ${req.method} ${req.url}` }));
    });
  });
  server.listen(0, '127.0.0.1');
  return new Promise(resolve => {
    server.once('listening', () => {
      const address = server.address() as AddressInfo;
      resolve({ server, baseUrl: `http://127.0.0.1:${address.port}`, requests });
    });
  }) as unknown as { server: http.Server; baseUrl: string; requests: CapturedRequest[] };
}

test('opsbot http client', async t => {
  const fixture = await createFixtureServer();
  setOpsbotBaseUrl(fixture.baseUrl);
  t.after(() => fixture.server.close());

  await t.test('startOpsbotRun posts the workflow payload and maps the run', async () => {
    const run = await startOpsbotRun({ workflowId: 'workflow.md', workspacePath: '/tmp/ws', content: '# wf' });
    const post = fixture.requests.find(r => r.method === 'POST' && r.url === '/api/v1/runs');
    assert.ok(post);
    assert.equal(post.body.program_path, '/tmp/ws/workflow.md');
    assert.equal(post.body.work_dir, '/tmp/ws');
    assert.equal(post.body.label, 'workflow.md');
    assert.equal(run.id, 'run-1');
    assert.equal(run.status, 'running');
    assert.equal(run.workflowId, 'workflow.md');
  });

  await t.test('startOpsbotRun refuses without a workspace', async () => {
    await assert.rejects(
      () => startOpsbotRun({ workflowId: 'workflow.md' }),
      (error: OpsbotApiError) => error instanceof OpsbotApiError && error.status === 422,
    );
  });

  await t.test('listOpsbotRuns maps statuses and workflow names', async () => {
    const runs = await listOpsbotRuns();
    assert.equal(runs.length, 2);
    assert.equal(runs[0].status, 'running');
    assert.equal(runs[1].status, 'cancelled');
    assert.equal(runs[1].workflowId, 'run-2');
    assert.equal(runs[1].updatedAt, '2026-11-03T09:30:00+00:00');
  });

  await t.test('getOpsbotRun fetches the run detail', async () => {
    const run = await getOpsbotRun('run-1');
    assert.equal(run.id, 'run-1');
  });

  await t.test('stopOpsbotRun posts stop and refreshes', async () => {
    await stopOpsbotRun('run-1');
    assert.ok(fixture.requests.some(r => r.method === 'POST' && r.url === '/api/v1/runs/run-1/stop'));
  });

  await t.test('404 surfaces the opsbot detail message', async () => {
    await assert.rejects(
      () => getOpsbotRun('missing'),
      (error: OpsbotApiError) => error instanceof OpsbotApiError && error.status === 404 && error.message.includes('run 不在账面：missing'),
    );
  });

  await t.test('unreachable opsbot reports a connection error', async () => {
    setOpsbotBaseUrl('http://127.0.0.1:1');
    await assert.rejects(
      () => listOpsbotRuns(),
      (error: OpsbotApiError) => error instanceof OpsbotApiError && error.status === 0 && error.message.includes('无法连接 Opsbot'),
    );
  });
});
