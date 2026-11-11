import { launchWorkbench, workbenchPage } from './launch';
import { test, expect } from '@playwright/test';
import { type ElectronApplication, type Page } from 'playwright';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

test.describe('run configuration', () => {
  let app: ElectronApplication;
  let window: Page;
  let workspaceDir: string;
  let executionBackendUrl: string;
  let backendServer: http.Server;
  let capturedBodies: Record<string, unknown>[] = [];
  let postedLabel = 'workflow.yaml';
  let postedSessionPrompt = 'session-prompt';

  test.beforeAll(async () => {
    workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wb-run-params-'));
    await fs.writeFile(path.join(workspaceDir, 'workflow.yaml'), [
      'workflow: run-smoke',
      'nodes:',
      '  - id: smoke',
      '    task_type: bash',
      '    command: echo run-ok',
      '    depends_on: []',
      '',
    ].join('\n'));
    await fs.writeFile(path.join(workspaceDir, 'notes.md'), '# Not a workflow\n');
    backendServer = http.createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json');
      let raw = '';
      req.on('data', chunk => { raw += chunk; });
      req.on('end', () => {
        let body: Record<string, unknown> = {};
        try { body = raw ? JSON.parse(raw) as Record<string, unknown> : {}; } catch { /* keep empty */ }
        if (req.method === 'POST' && req.url === '/api/v1/runs') {
          capturedBodies.push(body);
          if (body['program_path'] === path.join(workspaceDir, 'notes.md')) {
            res.statusCode = 422;
            res.end(JSON.stringify({ detail: '工作流文件缺少节点定义' }));
            return;
          }
          if (typeof body['label'] === 'string') postedLabel = body['label'];
          res.statusCode = 201;
          res.end(JSON.stringify({ run_id: 'run-params-1', status: 'running', format: 'graph-yaml@1', kind: 'workflow' }));
          return;
        }
        if (req.method === 'GET' && req.url === '/api/v1/runs') {
          res.end(JSON.stringify({ runs: [] }));
          return;
        }
        if (req.method === 'GET' && req.url === '/api/v1/auth/status') {
          res.end(JSON.stringify({ providers: [
            { index: 0, runtime: 'opencode', model: 'glm-4.7', status: 'active', is_active: true },
            { index: 1, runtime: 'claude_sdk', model: 'claude-sonnet-4-6', status: 'unused' },
            { index: 2, runtime: 'opencode', model: 'glm-4.7', status: 'unused' },
            { index: 3, runtime: 'opencode', model: 'exhausted-model', status: 'exhausted' },
            { index: 4, runtime: 'opencode', model: 'invalid-model', status: 'unused', worker_validation: { status: 'invalid' } },
          ] }));
          return;
        }
        if (req.method === 'POST' && req.url === '/api/v1/sessions/start') {
          capturedBodies.push(body);
          if (typeof body['prompt'] === 'string') postedSessionPrompt = body['prompt'];
          res.statusCode = 201;
          res.end(JSON.stringify({ session_id: 'sess-new' }));
          return;
        }
        if (req.method === 'GET' && req.url === '/api/v1/sessions') {
          res.end(JSON.stringify([]));
          return;
        }
        if (req.method === 'GET' && req.url === '/api/v1/sessions/sess-new') {
          res.end(JSON.stringify({ id: 'sess-new', name: postedSessionPrompt.slice(0, 20), role: 'worker', state: 'running', created_at: '2026-11-03T12:10:00+00:00', stop_reason: null, loop_status: 'yes' }));
          return;
        }
        if (req.method === 'GET' && req.url?.startsWith('/api/v1/runs/run-params-1')) {
          const record = { run_id: 'run-params-1', kind: 'workflow', format: 'graph-yaml@1', status: 'running', program_ref: 'workflow.yaml', params: {}, label: postedLabel, work_dir: workspaceDir, max_parallel: null, pause_reason: null, created_at: '2026-11-03T12:00:00+00:00', finished_at: null, reopened_at: null, error: null, member_count: 0, running_count: 0 };
          if (req.url.includes('/events')) {
            res.end(JSON.stringify({ events: [], next_cursor: 'c', limit: 200 }));
          } else {
            res.end(JSON.stringify({ run: record, sessions: [{ session_id: 'sess-exec', role: 'executor', context: null, state: 'running', stop_reason: null, in_flight: true }] }));
          }
          return;
        }
        res.statusCode = 404;
        res.end(JSON.stringify({ detail: `unexpected ${req.method} ${req.url}` }));
      });
    });
    await new Promise<void>(resolve => { backendServer.listen(0, '127.0.0.1', () => resolve()); });
    executionBackendUrl = `http://127.0.0.1:${(backendServer.address() as AddressInfo).port}`;
  });

  test.afterAll(async () => {
    backendServer.close();
    await fs.rm(workspaceDir, { recursive: true, force: true });
  });

  test.beforeEach(async () => {
    capturedBodies = [];
    app = await launchWorkbench({
      args: ['--no-sandbox', `--user-data-dir=${test.info().outputPath('profile')}`, path.resolve('.vite/build/main.js')],
      env: { ...process.env, EXECUTION_BACKEND_NO_AUTOSTART: '1', WORKBENCH_WORKSPACE: workspaceDir, EXECUTION_BACKEND_BASE_URL: executionBackendUrl },
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

  test('starts Graph with fixed parameters, variables and max parallel', async () => {
    await window.locator('.rail-item', { hasText: '工作台' }).click();
    await window.locator('.file-list').getByRole('button', { name: /workflow\.yaml/ }).click();
    await expect(window.getByRole('heading', { name: 'workflow.yaml', exact: true })).toBeVisible();
    await window.locator('.rail-item', { hasText: '运行' }).click();
    await expect(window.getByLabel('运行时', { exact: true })).toHaveValue('workflow');
    await expect(window.getByLabel('运行文件', { exact: true })).toHaveValue('');
    await expect(window.getByLabel('运行文件', { exact: true })).toHaveAttribute('placeholder', path.join(workspaceDir, 'workflow.yaml'));
    await expect(window.getByLabel('运行时', { exact: true }).locator('option:checked')).toHaveText('Graph');
    await window.getByLabel('运行名称').fill('release-check');
    await window.getByRole('button', { name: '添加变量' }).click();
    const rows = window.locator('.run-param-row');
    await rows.first().getByPlaceholder('键').fill('dataset');
    await rows.first().getByPlaceholder('值').fill('core');
    await window.getByLabel('最大并行数').fill('4');
    await window.getByLabel('提示词', { exact: true }).fill('按计划推进发布准备');
    await window.getByLabel('Agent 运行时', { exact: true }).selectOption('opencode');
    await window.getByLabel('模型', { exact: true }).selectOption('glm-4.7');
    await window.getByLabel('系统提示词').fill('保持输出简洁');
    await window.getByLabel('最大迭代').fill('3');
    await window.getByLabel('Reviewer', { exact: true }).selectOption('false');
    await window.getByText('高级参数', { exact: true }).click();
    await window.getByLabel('评估器', { exact: true }).fill('max_iteration');
    await window.getByRole('button', { name: '运行工作流' }).click();
    await expect(window.getByRole('option', { name: /release-check/ })).toBeVisible();
    expect(capturedBodies).toHaveLength(1);
    expect(capturedBodies[0]['program_path']).toBe(path.join(workspaceDir, 'workflow.yaml'));
    expect(capturedBodies[0]['format']).toBe('graph-yaml@1');
    expect(capturedBodies[0]['label']).toBe('release-check');
    expect(capturedBodies[0]['params']).toEqual({
      variables: '{"dataset":"core"}',
      starting_prompt: '按计划推进发布准备',
      runtime: 'opencode',
      model: 'glm-4.7',
      provider_index: 0,
      system_prompt: '保持输出简洁',
      max_iterations: 3,
      reviewer_enabled: false,
      evaluator: 'max_iteration',
    });
    expect(capturedBodies[0]['max_parallel']).toBe(4);
  });

  test('completes the selected file with Tab and sends the edited path with the Graph format', async () => {
    await window.getByRole('button', { name: '运行', exact: true }).click();
    const programPath = window.getByLabel('运行文件', { exact: true });
    const suggestion = await programPath.getAttribute('placeholder');
    expect(suggestion).toBeTruthy();
    await programPath.focus();
    await window.keyboard.press('Tab');
    await expect(programPath).toHaveValue(suggestion!);
    await expect(window.getByLabel('运行名称', { exact: true })).toBeFocused();
    await window.getByRole('button', { name: '工作台', exact: true }).click();
    await window.getByRole('button', { name: /^关闭 .*\.md$/ }).click();
    await window.getByRole('button', { name: '运行', exact: true }).click();
    await expect(programPath).toHaveAttribute('placeholder', '');
    await programPath.fill('other/workflow.yaml');
    await window.getByRole('button', { name: '运行工作流' }).click();
    await expect.poll(() => capturedBodies.length).toBe(1);
    expect(capturedBodies[0]['program_path']).toBe('other/workflow.yaml');
    expect(capturedBodies[0]['format']).toBe('graph-yaml@1');
    expect(capturedBodies[0]['label']).toBe('workflow.yaml');
    expect(await fs.readFile(path.join(workspaceDir, 'notes.md'), 'utf8')).toBe('# Not a workflow\n');
  });

  test('displays the backend error for a file that is not a workflow', async () => {
    await window.locator('.file-list').getByRole('button', { name: /notes\.md/ }).click();
    await window.getByRole('button', { name: '运行', exact: true }).click();
    await window.getByRole('button', { name: '运行工作流' }).click();
    await expect(window.locator('.run-list-error')).toContainText('工作流文件缺少节点定义');
    expect(capturedBodies[0]['program_path']).toBe(path.join(workspaceDir, 'notes.md'));
  });

  test('starts a session with prompt and agent options', async () => {
    await window.locator('.rail-item', { hasText: '运行' }).click();
    await window.getByLabel('运行时', { exact: true }).selectOption('session');
    await window.getByLabel('提示词', { exact: true }).fill('整理当前项目结构');
    const agentRuntime = window.getByLabel('Agent 运行时');
    const model = window.getByLabel('模型', { exact: true });
    const run = window.getByRole('button', { name: '运行工作流' });
    await expect(model.locator('option:not([disabled])')).toHaveText(['claude-sonnet-4-6']);
    await expect(model).toHaveValue('');
    await model.selectOption('claude-sonnet-4-6');
    await agentRuntime.selectOption('codex_cli');
    await expect(model.locator('option')).toHaveText(['该运行时没有可用模型']);
    await expect(model).toBeDisabled();
    await expect(run).toBeDisabled();
    expect(capturedBodies).toHaveLength(0);
    await agentRuntime.selectOption('opencode');
    await expect(model.locator('option:not([disabled])')).toHaveText(['glm-4.7']);
    await expect(model).toHaveValue('');
    await expect(run).toBeDisabled();
    await model.selectOption('glm-4.7');
    await window.getByLabel('最大迭代').fill('20');
    await window.getByLabel('启用 Reviewer').check();
    await run.click();
    await expect(window.getByRole('option', { name: /整理当前项目结构/ })).toBeVisible();
    await expect.poll(() => capturedBodies.length).toBe(1);
    expect(capturedBodies[0]['project_dir']).toBe(workspaceDir);
    expect(capturedBodies[0]['prompt']).toBe('整理当前项目结构');
    expect(capturedBodies[0]['runtime']).toBe('opencode');
    expect(capturedBodies[0]['model']).toBe('glm-4.7');
    expect(capturedBodies[0]['provider_index']).toBe(0);
    expect(capturedBodies[0]['max_iterations']).toBe(20);
    expect(capturedBodies[0]['reviewer_enabled']).toBe(true);
  });
});
