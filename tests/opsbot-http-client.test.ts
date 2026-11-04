import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  getInsightStatus,
  getOpsbotRun,
  getOpsbotRunSessions,
  importOpsbotSessionToInsight,
  listOpsbotRuns,
  setOpsbotBaseUrl,
  startOpsbotRun,
  startOpsbotSession,
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
        res.end(JSON.stringify({ run: { run_id: 'run-1', kind: 'workflow', format: 'markdown', status: 'running', program_ref: 'workflow.md', params: {}, label: 'workflow.md', work_dir: '/tmp/ws', max_parallel: null, pause_reason: null, created_at: '2026-11-03T10:00:00+00:00', finished_at: null, reopened_at: null, error: null, member_count: 1, running_count: 1 }, sessions: [{ session_id: 'sess-1', role: 'executor', context: null, state: 'running', stop_reason: null, in_flight: true }] }));
        return;
      }
      if (req.method === 'POST' && req.url?.startsWith('/api/v1/insight/import')) {
        const sessionId = new URL(req.url, 'http://x').searchParams.get('session_id');
        if (sessionId === 'sess-missing') {
          res.end(JSON.stringify({ ok: false, error: 'Cannot connect to cannbot-insight at localhost:21025' }));
          return;
        }
        res.end(JSON.stringify({ ok: true, sessionId, insightUrl: `/insight/session/${sessionId}`, imported: true }));
        return;
      }
      if (req.method === 'GET' && req.url === '/api/v1/insight/status') {
        res.end(JSON.stringify({ running: true, port: 21025 }));
        return;
      }
      if (req.method === 'POST' && req.url === '/api/v1/runs/run-1/stop') {
        res.end(JSON.stringify({ run_id: 'run-1', status: 'stopped', accepted: true }));
        return;
      }
      if (req.method === 'GET' && req.url === '/api/v1/sessions') {
        res.end(JSON.stringify([{ id: 'sess-9', name: 'ad-hoc-session', role: 'worker', state: 'running', created_at: '2026-11-03T09:00:00+00:00', stop_reason: null, loop_status: 'yes' }]));
        return;
      }
      if (req.method === 'GET' && req.url === '/api/v1/sessions/sess-9') {
        res.end(JSON.stringify({ id: 'sess-9', name: 'ad-hoc-session', role: 'worker', state: 'running', created_at: '2026-11-03T09:00:00+00:00', stop_reason: null, loop_status: 'yes' }));
        return;
      }
      if (req.method === 'POST' && req.url === '/api/v1/sessions/start') {
        res.statusCode = 201;
        res.end(JSON.stringify({ session_id: 'sess-new' }));
        return;
      }
      if (req.method === 'GET' && req.url === '/api/v1/sessions/sess-new') {
        res.end(JSON.stringify({ id: 'sess-new', name: 'my prompt', role: 'worker', state: 'running', created_at: '2026-11-03T09:30:00+00:00', stop_reason: null, loop_status: 'yes' }));
        return;
      }
      if (req.method === 'POST' && req.url === '/api/v1/sessions/sess-new/stop') {
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      if (req.method === 'GET' && req.url === '/api/v1/sessions/missing') {
        res.statusCode = 404;
        res.end(JSON.stringify({ detail: 'session 不在账面：missing' }));
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
    const run = await startOpsbotRun({ workflowId: 'workflow.md', workspacePath: '/tmp/ws', content: '# wf', runtime: 'opsbot-run' });
    const post = fixture.requests.find(r => r.method === 'POST' && r.url === '/api/v1/runs');
    assert.ok(post);
    assert.equal(post.body.program_path, '/tmp/ws/workflow.md');
    assert.equal(post.body.work_dir, '/tmp/ws');
    assert.equal(post.body.label, undefined);
    assert.equal(run.id, 'run-1');
    assert.equal(run.status, 'running');
    assert.equal(run.workflowId, 'workflow.md');
  });

  await t.test('startOpsbotRun passes label, params and max_parallel when provided', async () => {
    const run = await startOpsbotRun({ workflowId: 'workflow.md', workspacePath: '/tmp/ws', content: '# wf', runtime: 'opsbot-run', label: 'release-check', params: { dataset: 'core', mode: 'fast' }, maxParallel: 4 });
    const post = fixture.requests.filter(r => r.method === 'POST' && r.url === '/api/v1/runs').at(-1);
    assert.ok(post);
    assert.equal(post.body.label, 'release-check');
    assert.deepEqual(post.body.params, { dataset: 'core', mode: 'fast' });
    assert.equal(post.body.max_parallel, 4);
    assert.equal(run.id, 'run-1');
  });

  await t.test('startOpsbotRun refuses without a workspace', async () => {
    await assert.rejects(
      () => startOpsbotRun({ workflowId: 'workflow.md', runtime: 'opsbot-run' }),
      (error: OpsbotApiError) => error instanceof OpsbotApiError && error.status === 422,
    );
  });

  await t.test('listOpsbotRuns merges runs and sessions with runtime ids', async () => {
    const runs = await listOpsbotRuns();
    assert.equal(runs.length, 3);
    assert.equal(runs[0].status, 'running');
    assert.equal(runs[0].runtimeId, 'opsbot-run');
    assert.equal(runs[1].status, 'cancelled');
    assert.equal(runs[1].workflowId, 'run-2');
    assert.equal(runs[1].updatedAt, '2026-11-03T09:30:00+00:00');
    assert.equal(runs[2].id, 'sess-9');
    assert.equal(runs[2].runtimeId, 'opsbot-session');
    assert.equal(runs[2].workflowId, 'ad-hoc-session');
  });

  await t.test('startOpsbotSession posts the session payload and maps the run', async () => {
    const run = await startOpsbotSession({ workflowId: '', workspacePath: '/tmp/ws', runtime: 'opsbot-session', prompt: 'my prompt', sessionRuntime: 'claude_sdk', model: 'claude-sonnet', systemPrompt: 'be brief', maxIterations: 12, reviewerEnabled: true });
    const post = fixture.requests.find(r => r.method === 'POST' && r.url === '/api/v1/sessions/start');
    assert.ok(post);
    assert.equal(post.body.project_dir, '/tmp/ws');
    assert.equal(post.body.prompt, 'my prompt');
    assert.equal(post.body.runtime, 'claude_sdk');
    assert.equal(post.body.model, 'claude-sonnet');
    assert.equal(post.body.system_prompt, 'be brief');
    assert.equal(post.body.max_iterations, 12);
    assert.equal(post.body.reviewer_enabled, true);
    assert.equal(run.id, 'sess-new');
    assert.equal(run.runtimeId, 'opsbot-session');
  });

  await t.test('startOpsbotSession requires a prompt', async () => {
    await assert.rejects(
      () => startOpsbotSession({ workflowId: '', workspacePath: '/tmp/ws', runtime: 'opsbot-session' }),
      (error: OpsbotApiError) => error instanceof OpsbotApiError && error.status === 422 && error.message.includes('提示词'),
    );
  });

  await t.test('stopOpsbotRun dispatches to the session stop endpoint for sessions', async () => {
    await stopOpsbotRun('sess-new');
    assert.ok(fixture.requests.some(r => r.method === 'POST' && r.url === '/api/v1/sessions/sess-new/stop'));
  });

  await t.test('getOpsbotRun fetches the run detail', async () => {
    const run = await getOpsbotRun('run-1');
    assert.equal(run.id, 'run-1');
  });

  await t.test('stopOpsbotRun posts stop and refreshes', async () => {
    await stopOpsbotRun('run-1');
    assert.ok(fixture.requests.some(r => r.method === 'POST' && r.url === '/api/v1/runs/run-1/stop'));
  });

  await t.test('getOpsbotRunSessions returns the run members', async () => {
    const sessions = await getOpsbotRunSessions('run-1');
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].session_id, 'sess-1');
    assert.equal(sessions[0].role, 'executor');
  });

  await t.test('importOpsbotSessionToInsight posts the import and maps the result', async () => {
    const result = await importOpsbotSessionToInsight('sess-1');
    assert.equal(result.ok, true);
    assert.equal(result.insightUrl, '/insight/session/sess-1');
    assert.ok(fixture.requests.some(r => r.method === 'POST' && r.url?.startsWith('/api/v1/insight/import?session_id=sess-1')));
  });

  await t.test('importOpsbotSessionToInsight surfaces service-level errors', async () => {
    const result = await importOpsbotSessionToInsight('sess-missing');
    assert.equal(result.ok, false);
    assert.match(result.error ?? '', /Cannot connect/);
  });

  await t.test('getInsightStatus reports the insight port', async () => {
    const status = await getInsightStatus();
    assert.equal(status.running, true);
    assert.equal(status.port, 21025);
  });

  await t.test('404 surfaces the opsbot detail message', async () => {
    await assert.rejects(
      () => getOpsbotRun('missing'),
      (error: OpsbotApiError) => error instanceof OpsbotApiError && error.status === 404 && error.message.includes('session 不在账面：missing'),
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
