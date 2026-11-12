import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  activateProvider,
  deleteProvider,
  getRun,
  getRunSessions,
  importSessionToInsight,
  injectSessionPrompt,
  listRuns,
  listProviders,
  saveProviders,
  sendSessionReply,
  setSessionPaused,
  startWorkflowRun,
  startSessionRun,
  stopRun,
  testProvider,
  testProviderKey,
} from '../src/executionBackend/http';
import { ExecutionBackendApiError } from '../src/executionBackend/api';
import { DEFAULT_EXECUTION_BACKEND_URL } from '../src/shared/executionBackendConfig';

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
      if (req.method === 'GET' && req.url === '/api/v1/sessions/sess-1/transcript-source') {
        res.end(JSON.stringify({ ok: true, source: 'claude-jsonl', sessionId: 'sdk-1', filePath: '/server/sdk-1.jsonl' }));
        return;
      }
      if (req.method === 'GET' && req.url === '/api/v1/sessions/sess-missing/transcript-source') {
        res.end(JSON.stringify({ ok: false, error: 'Session not found' }));
        return;
      }
      if (req.method === 'POST' && req.url === '/api/ingest/import-file') {
        res.end(JSON.stringify({ imported: false, reason: 'already-exists', sessionId: 'insight-row', taskId: 'sdk-1' }));
        return;
      }
      if (req.method === 'POST' && req.url === '/api/v1/runs/run-1/sessions/sess-1/inject') {
        res.end(JSON.stringify({ run_id: 'run-1', session_id: 'sess-1', accepted: true }));
        return;
      }
      if (req.method === 'GET' && req.url === '/api/v1/sessions/sess-1') {
        res.end(JSON.stringify({ id: 'sess-1', run_id: 'run-1', state: 'idle', stop_reason: 'user_pause' }));
        return;
      }
      if (req.method === 'POST' && /^\/api\/v1\/runs\/run-1\/sessions\/sess-1\/(pause|resume|send|stop)$/.test(req.url ?? '')) {
        res.statusCode = 202;
        res.end(JSON.stringify({ accepted: true }));
        return;
      }
      if (req.method === 'POST' && req.url === '/api/v1/runs/run-1/stop') {
        res.end(JSON.stringify({ run_id: 'run-1', status: 'stopped', accepted: true }));
        return;
      }
      if (req.method === 'GET' && req.url === '/api/v1/auth/keys') {
        res.end(JSON.stringify({ keys: [{ key: 'sk-abc123', masked: 'sk-a*****3', provider_index: 0, model: 'claude-sonnet-4-6', base_url: 'https://api.example.com', runtime: 'claude_sdk', worker_validation: { success: true } }] }));
        return;
      }
      if (req.method === 'POST' && req.url === '/api/v1/auth/keys') {
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      if (req.method === 'DELETE' && req.url === '/api/v1/auth/keys/0') {
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      if (req.method === 'POST' && req.url === '/api/v1/auth/activate') {
        res.end(JSON.stringify({ ok: true, active_index: 0 }));
        return;
      }
      if (req.method === 'POST' && req.url === '/api/v1/auth/keys/0/test') {
        res.end(JSON.stringify({ success: true }));
        return;
      }
      if (req.method === 'POST' && req.url === '/api/v1/auth/test-key') {
        res.end(JSON.stringify({ success: true }));
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

test('execution backend HTTP client', async t => {
  const fixture = await createFixtureServer();
  const fetchRequest = globalThis.fetch;
  t.mock.method(globalThis, 'fetch', (input: string | URL, init?: RequestInit) => {
    if (input instanceof URL) {
      assert.equal(input.origin, fixture.baseUrl);
      return fetchRequest(input, init);
    }
    const url = input;
    assert.ok(url.startsWith(DEFAULT_EXECUTION_BACKEND_URL + '/'));
    return fetchRequest(fixture.baseUrl + url.slice(DEFAULT_EXECUTION_BACKEND_URL.length), init);
  });
  t.after(() => fixture.server.close());

  await t.test('startWorkflowRun posts the workflow payload and maps the run', async () => {
    const run = await startWorkflowRun({ workflowId: 'workflow.md', workspacePath: '/tmp/ws', content: '# wf', runtime: 'workflow', programPath: '/tmp/ws/workflow.md', format: 'graph-yaml@1' });
    const post = fixture.requests.find(r => r.method === 'POST' && r.url === '/api/v1/runs');
    assert.ok(post);
    assert.equal(post.body.format, 'graph-yaml@1');
    assert.equal(post.body.program_path, '/tmp/ws/workflow.md');
    assert.equal(post.body.work_dir, '/tmp/ws');
    assert.equal(post.body.label, undefined);
    assert.equal(run.id, 'run-1');
    assert.equal(run.status, 'running');
    assert.equal(run.workflowId, 'workflow.md');
  });

  await t.test('startWorkflowRun passes label, params and max_parallel when provided', async () => {
    const run = await startWorkflowRun({ workflowId: 'workflow.md', workspacePath: '/tmp/ws', content: '# wf', runtime: 'workflow', label: 'release-check', params: { variables: '{"dataset":"core","mode":"fast"}', max_iterations: 3, reviewer_enabled: false }, maxParallel: 4 });
    const post = fixture.requests.filter(r => r.method === 'POST' && r.url === '/api/v1/runs').at(-1);
    assert.ok(post);
    assert.equal(post.body.label, 'release-check');
    assert.deepEqual(post.body.params, { variables: '{"dataset":"core","mode":"fast"}', max_iterations: 3, reviewer_enabled: false });
    assert.equal(post.body.max_parallel, 4);
    assert.equal(run.id, 'run-1');
  });

  await t.test('startWorkflowRun forwards the specified program path and format', async () => {
    await startWorkflowRun({ workflowId: 'workflow.md', workspacePath: '/tmp/ws', runtime: 'workflow', programPath: '../other/program.yaml', format: 'custom@2' });
    const post = fixture.requests.filter(r => r.method === 'POST' && r.url === '/api/v1/runs').at(-1);
    assert.ok(post);
    assert.equal(post.body.program_path, '../other/program.yaml');
    assert.equal(post.body.format, 'custom@2');
    assert.equal(post.body.work_dir, '/tmp/ws');
  });

  await t.test('startWorkflowRun does not supply missing program path or format', async () => {
    await startWorkflowRun({ workflowId: 'workflow.md', workspacePath: '/tmp/ws', runtime: 'workflow' });
    const post = fixture.requests.filter(r => r.method === 'POST' && r.url === '/api/v1/runs').at(-1);
    assert.ok(post);
    assert.equal(Object.hasOwn(post.body, 'program_path'), false);
    assert.equal(Object.hasOwn(post.body, 'format'), false);
  });

  await t.test('startWorkflowRun refuses without a workspace', async () => {
    await assert.rejects(
      () => startWorkflowRun({ workflowId: 'workflow.md', runtime: 'workflow' }),
      (error: ExecutionBackendApiError) => error instanceof ExecutionBackendApiError && error.status === 422,
    );
  });

  await t.test('listRuns merges runs and sessions with runtime ids', async () => {
    const runs = await listRuns();
    assert.equal(runs.length, 3);
    assert.equal(runs[0].status, 'running');
    assert.equal(runs[0].runtimeId, 'workflow');
    assert.equal(runs[1].status, 'cancelled');
    assert.equal(runs[1].workflowId, 'run-2');
    assert.equal(runs[1].updatedAt, '2026-11-03T09:30:00+00:00');
    assert.equal(runs[2].id, 'sess-9');
    assert.equal(runs[2].runtimeId, 'session');
    assert.equal(runs[2].workflowId, 'ad-hoc-session');
  });

  await t.test('startSessionRun posts the session payload and maps the run', async () => {
    const run = await startSessionRun({ workflowId: '', workspacePath: '/tmp/ws', runtime: 'session', prompt: 'my prompt', sessionRuntime: 'claude_sdk', model: 'claude-sonnet', systemPrompt: 'be brief', maxIterations: 12, reviewerEnabled: true });
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
    assert.equal(run.runtimeId, 'session');
  });

  await t.test('startSessionRun requires a prompt', async () => {
    await assert.rejects(
      () => startSessionRun({ workflowId: '', workspacePath: '/tmp/ws', runtime: 'session' }),
      (error: ExecutionBackendApiError) => error instanceof ExecutionBackendApiError && error.status === 422 && error.message.includes('提示词'),
    );
  });

  await t.test('stopRun dispatches to the session stop endpoint for sessions', async () => {
    await stopRun('sess-new');
    assert.ok(fixture.requests.some(r => r.method === 'POST' && r.url === '/api/v1/sessions/sess-new/stop'));
  });

  await t.test('getRun fetches the run detail', async () => {
    const run = await getRun('run-1');
    assert.equal(run.id, 'run-1');
  });

  await t.test('stopRun posts stop and refreshes', async () => {
    await stopRun('run-1');
    assert.ok(fixture.requests.some(r => r.method === 'POST' && r.url === '/api/v1/runs/run-1/stop'));
  });

  await t.test('getRunSessions returns the run members', async () => {
    const sessions = await getRunSessions('run-1');
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].session_id, 'sess-1');
    assert.equal(sessions[0].role, 'executor');
  });

  await t.test('importSessionToInsight sends the transcript to Insight and opens existing imports', async () => {
    const result = await importSessionToInsight('sess-1', fixture.baseUrl);
    assert.deepEqual(result, { ok: true, sessionId: 'sdk-1', imported: false, insightUrl: '/run/solo:sdk-1' });
    assert.deepEqual(fixture.requests.slice(-2), [
      { method: 'GET', url: '/api/v1/sessions/sess-1/transcript-source', body: {} },
      { method: 'POST', url: '/api/ingest/import-file', body: { source: 'claude-jsonl', sessionId: 'sdk-1', filePath: '/server/sdk-1.jsonl' } },
    ]);
  });

  await t.test('importSessionToInsight surfaces service-level errors', async () => {
    const before = fixture.requests.length;
    const result = await importSessionToInsight('sess-missing', fixture.baseUrl);
    assert.deepEqual(result, { ok: false, error: 'Session not found' });
    assert.equal(fixture.requests.length, before + 1);
  });

  await t.test('injectSessionPrompt posts to the inject endpoint', async () => {
    await injectSessionPrompt('run-1', 'sess-1', '请继续推进');
    const inject = fixture.requests.find(r => r.method === 'POST' && r.url === '/api/v1/runs/run-1/sessions/sess-1/inject');
    assert.ok(inject);
    assert.equal(inject.body.prompt, '请继续推进');
  });

  await t.test('workflow member actions use the owning run endpoints', async () => {
    await getRun('sess-1');
    const before = fixture.requests.length;
    await setSessionPaused('sess-1', true);
    await setSessionPaused('sess-1', false);
    await sendSessionReply('sess-1', ' 请继续检查 ');
    await stopRun('sess-1');
    const posts = fixture.requests.slice(before).filter(request => request.method === 'POST');
    assert.deepEqual(posts.map(request => [request.url, request.body]), [
      ['/api/v1/runs/run-1/sessions/sess-1/pause', {}],
      ['/api/v1/runs/run-1/sessions/sess-1/resume', {}],
      ['/api/v1/runs/run-1/sessions/sess-1/send', { prompt: '请继续检查' }],
      ['/api/v1/runs/run-1/sessions/sess-1/stop', {}],
    ]);
  });

  await t.test('listProviders maps the provider rows', async () => {
    const providers = await listProviders();
    assert.equal(providers.length, 1);
    assert.equal(providers[0].masked, 'sk-a*****3');
    assert.equal(providers[0].model, 'claude-sonnet-4-6');
    assert.equal(providers[0].worker_validation?.success, true);
  });

  await t.test('saveProviders posts the full key list', async () => {
    const result = await saveProviders([{ key: 'sk-new', model: 'claude-opus', base_url: 'https://x', runtime: 'opencode' }]);
    assert.equal(result.ok, true);
    const post = fixture.requests.find(r => r.method === 'POST' && r.url === '/api/v1/auth/keys');
    assert.ok(post);
    const postedKeys = post.body.keys as Array<Record<string, unknown>>;
    assert.equal(postedKeys[0].key, 'sk-new');
    assert.equal(postedKeys[0].runtime, 'opencode');
  });

  await t.test('deleteProvider calls the delete endpoint', async () => {
    await deleteProvider(0);
    assert.ok(fixture.requests.some(r => r.method === 'DELETE' && r.url === '/api/v1/auth/keys/0'));
  });

  await t.test('activateProvider posts the index and maps the active index', async () => {
    const result = await activateProvider(0);
    assert.equal(result.ok, true);
    assert.equal(result.activeIndex, 0);
    const post = fixture.requests.find(r => r.method === 'POST' && r.url === '/api/v1/auth/activate');
    assert.equal(post?.body.index, 0);
  });

  await t.test('testProvider retests one provider row', async () => {
    const result = await testProvider(0);
    assert.equal(result.success, true);
  });

  await t.test('testProviderKey validates a candidate without saving', async () => {
    const result = await testProviderKey('sk-candidate', 'claude-opus', 'https://api.example.com', 'claude_sdk');
    assert.equal(result.success, true);
    const post = fixture.requests.find(r => r.method === 'POST' && r.url === '/api/v1/auth/test-key');
    assert.equal(post?.body.key, 'sk-candidate');
    assert.equal(post?.body.base_url, 'https://api.example.com');
  });

  await t.test('404 surfaces the backend detail message', async () => {
    await assert.rejects(
      () => getRun('missing'),
      (error: ExecutionBackendApiError) => error instanceof ExecutionBackendApiError && error.status === 404 && error.message.includes('session 不在账面：missing'),
    );
  });

  await t.test('a missing run collection identifies the incompatible backend URL', async subtest => {
    subtest.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 404 }));
    await assert.rejects(
      () => listRuns(),
      (error: ExecutionBackendApiError) => error instanceof ExecutionBackendApiError && error.status === 404 &&
        error.message.includes(DEFAULT_EXECUTION_BACKEND_URL) && error.message.includes('GET /api/v1/runs'),
    );
  });

  await t.test('unreachable backend reports a connection error', async subtest => {
    subtest.mock.method(globalThis, 'fetch', async () => { throw new Error('Connection refused'); });
    await assert.rejects(
      () => listRuns(),
      (error: ExecutionBackendApiError) => error instanceof ExecutionBackendApiError && error.status === 0 && error.message.includes('无法连接 Workflow Controller'),
    );
  });
});
