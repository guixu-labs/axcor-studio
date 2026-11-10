import { test, expect } from '@playwright/test';
import { _electron as electron, type ElectronApplication, type Page } from 'playwright';
import { mkdir } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

const runRecord = {
  run_id: 'run-a', kind: 'workflow', format: 'markdown', status: 'running',
  program_ref: 'workflow.md', params: {}, label: 'workflow.md', work_dir: '/tmp/ws',
  max_parallel: null, pause_reason: null, created_at: '2026-11-03T10:00:00+00:00',
  finished_at: null, reopened_at: null, error: null, member_count: 1, running_count: 1,
};

const sessionRecord = {
  id: 'session-a', name: '会话日志示例', state: 'idle', stop_reason: 'max_iterations', created_at_iso: '2026-11-03T10:00:00+00:00',
  model: 'fixture-model', current_iteration: 2, max_iterations: 2, elapsed_seconds: 65,
};

const assistantEvent = {
  rowid: 0, session_id: sessionRecord.id, iteration: 2, timestamp: '2026-11-03T10:00:01+00:00',
  event_type: 'assistant_message', data: { content: [
    { type: 'thinking', thinking: '先检查入口文件。' }, { type: 'text', text: '已读完工作区文件。' },
  ] },
};

function startFixtureBackend(): Promise<{ url: string; close: () => void }> {
  let eventCursorSeen = false;
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'GET' && req.url === '/api/v1/sessions') {
      res.end(JSON.stringify([sessionRecord]));
      return;
    }
    if (req.method === 'GET' && req.url === '/api/v1/sessions/session-a') {
      res.end(JSON.stringify(sessionRecord));
      return;
    }
    if (req.method === 'GET' && req.url?.startsWith('/api/v1/events?session_id=session-a')) {
      const params = new URL(req.url, 'http://localhost').searchParams;
      const cursor = params.get('cursor');
      const events = cursor === null ? [
        assistantEvent,
        { ...assistantEvent, event_type: 'notification', data: { subtype: 'thinking_tokens', estimated_tokens_delta: 1 } },
        { ...assistantEvent, event_type: 'session_activated', data: { state: 'running' } },
        { ...assistantEvent, event_type: 'iteration_start', data: { iteration: 2 } },
        { ...assistantEvent, event_type: 'notification', data: { subtype: 'commands_changed', commands: ['fixture-command'] } },
        { ...assistantEvent, event_type: 'notification', data: { subtype: 'task_notification', summary: '后台任务完成', status: 'completed' } },
        { ...assistantEvent, event_type: 'notification', data: { subtype: 'task_summary', detail: '已检查任务。' } },
        { ...assistantEvent, event_type: 'tool_use', data: { name: 'Read', id: 'tool-a', input: { file_path: 'workflow.md' } } },
        { ...assistantEvent, event_type: 'tool_call', data: { name: 'Read', arg: 'workflow.md', tool_use_id: 'tool-a' } },
        { ...assistantEvent, event_type: 'user_message', data: { content: [
          { type: 'text', text: '继续检查。' }, { type: 'tool_result', tool_use_id: 'tool-a', content: '内嵌工具结果' },
        ] } },
        { ...assistantEvent, event_type: 'tool_result', data: { tool_use_id: 'tool-a', content: '读取到工作流定义。' } },
        { ...assistantEvent, event_type: 'tool_call', data: { name: 'WebSearch', arg: JSON.stringify({ query: '检查示例'.repeat(40) }), is_error: true } },
        { ...assistantEvent, event_type: 'tool_call', data: { name: 'Glob', arg: '*.md' } },
        { ...assistantEvent, event_type: 'tool_call', data: { name: 'Agent', arg: '检查工作区' } },
        { ...assistantEvent, event_type: 'subagent_start', data: { agent_id: 'agent-a', agent_type: 'Explore' } },
        { ...assistantEvent, event_type: 'subagent_progress', data: { agent_id: 'agent-a', messages: [{ type: 'text', text: '正在检查工作区。' }] } },
        { ...assistantEvent, event_type: 'subagent_stop', data: { agent_id: 'agent-a', content: '检查完成。' } },
        { ...assistantEvent, event_type: 'subagent_start', data: { agent_id: 'nested-agent', agent_type: 'Verifier', parent_agent_id: 'agent-a' } },
        { ...assistantEvent, event_type: 'tool_use', data: { id: 'call-beijing', name: 'Agent', input: { description: '查询北京天气', subagent_type: 'general-purpose' } } },
        { ...assistantEvent, event_type: 'tool_call', data: { tool_use_id: 'call-beijing', name: 'Agent' } },
        { ...assistantEvent, event_type: 'notification', data: { subtype: 'task_started', task_type: 'local_agent', task_id: 'task-beijing', tool_use_id: 'call-beijing' } },
        { ...assistantEvent, event_type: 'tool_call', data: { tool_use_id: 'call-shanghai', name: 'Agent', arg: '{"description":"查询上海天气"}' } },
        { ...assistantEvent, event_type: 'notification', data: { subtype: 'task_started', task_type: 'local_agent', task_id: 'task-shanghai', tool_use_id: 'call-shanghai' } },
        { ...assistantEvent, event_type: 'subagent_start', data: { agent_id: 'task-shanghai', agent_type: 'general-purpose' } },
        { ...assistantEvent, event_type: 'notification', data: { subtype: 'task_started', task_type: 'local_bash', task_id: 'background-shell', description: '后台命令' } },
        { ...assistantEvent, event_type: 'step_finish', data: { modelUsage: { 'fixture-model': { contextWindow: 200000 } } } },
        ...Array.from({ length: 90 }, (_, index) => ({ ...assistantEvent, event_type: 'process_output', data: { line: `工作区检查输出 ${index + 1}` } })),
      ] : cursor === '1' ? [
        assistantEvent,
        { ...assistantEvent, timestamp: '2026-11-03T10:00:02+00:00', event_type: 'context_usage', data: { context_usage: { input_tokens: 1200, output_tokens: 60, cache_read_input_tokens: 800, cache_creation_input_tokens: 40 } } },
        { ...assistantEvent, timestamp: '2026-11-03T10:00:02+00:00', event_type: 'notification', data: { subtype: 'task_notification', task_id: 'task-beijing', tool_use_id: 'call-beijing', status: 'completed' } },
      ] : [];
      res.end(JSON.stringify({ cursor: cursor === null ? '1' : '2', events }));
      return;
    }
    if (req.method === 'GET' && req.url === '/api/v1/runs') {
      res.end(JSON.stringify({ runs: [runRecord] }));
      return;
    }
    if (req.method === 'GET' && req.url === '/api/v1/runs/run-a') {
      res.end(JSON.stringify({ run: runRecord, sessions: [] }));
      return;
    }
    if (req.method === 'GET' && req.url?.startsWith('/api/v1/runs/run-a/events')) {
      const events = eventCursorSeen ? [] : [
        { id: 1, run_id: 'run-a', session_id: null, iteration: null, timestamp: '2026-11-03T10:00:01+00:00', event_type: 'session_state_changed', data: JSON.stringify({ state: 'running' }), source: 'run_events' },
        { id: 1, run_id: 'run-a', session_id: null, iteration: null, timestamp: '2026-11-03T10:00:02+00:00', event_type: 'process_output', data: JSON.stringify({ line: 'workflow output line' }), source: 'events' },
      ];
      eventCursorSeen = true;
      res.end(JSON.stringify({ events, next_cursor: 'cursor-1', limit: 200 }));
      return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ detail: `unexpected ${req.method} ${req.url}` }));
  });
  server.listen(0, '127.0.0.1');
  return new Promise(resolve => {
    server.once('listening', () => {
      const address = server.address() as AddressInfo;
      resolve({ url: `http://127.0.0.1:${address.port}`, close: () => server.close() });
    });
  });
}

test.describe('execution runs', () => {
  let app: ElectronApplication;
  let window: Page;
  let fixture: { url: string; close: () => void };

  test.beforeAll(async () => {
    fixture = await startFixtureBackend();
  });

  test.afterAll(() => {
    fixture.close();
  });

  test.beforeEach(async () => {
    app = await electron.launch({
      args: ['--no-sandbox', `--user-data-dir=${test.info().outputPath('profile')}`, path.resolve('.vite/build/main.js')],
      env: { ...process.env, EXECUTION_BACKEND_NO_AUTOSTART: '1', EXECUTION_BACKEND_BASE_URL: fixture.url },
    });
    window = await app.firstWindow();
    window.on('console', message => console.log(`[renderer:${message.type()}] ${message.text()}`));
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

  test('lists runs and streams events for the selected run', async () => {
    const entry = window.getByRole('option', { name: /workflow\.md/ });
    await expect(entry).toBeVisible();
    await entry.click();
    await expect(window.locator('.run-detail')).toContainText('run-a');
    await expect(window.getByRole('log')).toContainText('workflow output line');
    await expect(window.getByRole('log')).not.toContainText('session_state_changed');
    await expect(window.locator('.run-overview')).toContainText('成员会话');
    await expect(window.locator('.run-detail-title .status-badge')).toHaveText('运行中');
    const elapsed = window.locator('.run-detail-title .run-elapsed');
    await expect(elapsed).toHaveAttribute('datetime', /^PT\d+S$/);
    const initial = Number((await elapsed.getAttribute('datetime'))?.slice(2, -1));
    await expect(elapsed).toHaveAttribute('datetime', `PT${initial + 1}S`);
    await expect(elapsed).toHaveAttribute('datetime', `PT${initial + 2}S`);

    await window.locator('.rail-settings').click();
    await window.getByRole('button', { name: '常规' }).click();
    await window.getByLabel('语言').click();
    await window.getByRole('option', { name: 'English' }).click();
    await window.locator('.modal-close').click();
    await expect(window.locator('.run-detail-title .status-badge')).toHaveText('Running');
  });

  test('shows session output and measured context usage in separate panes', async () => {
    await window.getByRole('option', { name: /会话日志示例/ }).click();
    const log = window.getByRole('log', { name: '运行日志' });
    const overview = window.locator('.run-overview');
    const assistant = log.locator('.event').filter({ hasText: '助手消息' });
    await expect(assistant.locator('summary')).toHaveText('已读完工作区文件。');
    await expect(assistant.locator('.event-thinking')).toBeHidden();
    await assistant.locator('summary').click();
    await expect(assistant.locator('.event-thinking')).toBeVisible();
    await expect(assistant.locator('.event-thinking')).toContainText('先检查入口文件。');
    await assistant.locator('summary').press('Enter');
    await expect(assistant.locator('.event-thinking')).toBeHidden();
    const tool = log.locator('.event').filter({ has: window.locator('.event-preview', { hasText: /^Read · workflow\.md$/ }) });
    await expect(tool).toHaveCount(1);
    await expect(tool).toHaveCSS('grid-template-columns', /^64px 80px /);
    await expect(tool.locator(':scope > .event-state')).toHaveText('已返回');
    await tool.locator('summary').click();
    await expect(tool.locator('.event-block')).toHaveText([/参数.*workflow\.md/s, /结果.*读取到工作流定义。/s]);
    const failedTool = log.locator('.event').filter({ has: window.locator('.event-preview', { hasText: /^WebSearch · 检查示例/ }) });
    await expect(failedTool.locator(':scope > .event-state')).toHaveText('失败');
    const spacing = await failedTool.evaluate(node => {
      const preview = node.querySelector('.event-preview')!;
      const status = node.querySelector('.event-state')!;
      return { clipped: preview.scrollWidth > preview.clientWidth, gap: status.getBoundingClientRect().left - preview.getBoundingClientRect().right };
    });
    expect(spacing.clipped).toBe(true);
    expect(spacing.gap).toBeGreaterThanOrEqual(8);
    const dispatch = log.locator('.event').filter({ has: window.locator('.event-preview', { hasText: /^查询北京天气$/ }) });
    await expect(dispatch.locator('.event-kind')).toHaveText('子代理调用');
    for (const text of ['继续检查。', '已检查任务。', 'Glob · *.md']) {
      const row = log.locator('.event').filter({ has: window.getByText(text, { exact: true }) });
      await expect(row.locator('.event-preview')).toHaveText(text);
      await expect(row.locator('details')).toHaveCount(0);
    }
    await expect(log).toContainText('后台任务完成');
    await expect(log).not.toContainText(/thinking_tokens|session_activated|session_state_changed|iteration_start|context_usage|commands_changed|内嵌工具结果/);
    await expect(window.locator('.run-detail-title .status-badge')).toHaveText('已完成');
    await expect(window.locator('.run-detail-title .run-elapsed')).toHaveText('00:01:05');
    await expect(overview).toContainText('fixture-model');
    await expect(overview).toContainText('2 / 2');
    await expect(overview).toContainText('2,100 / 200,000 tokens');
    await expect(overview.locator('.run-context-percent')).toHaveText('1.1%');
    await expect(overview.locator('.run-context-legend')).toContainText('剩余用量');
    await expect(log).toContainText('子代理调用');
    await expect(log).toContainText('子代理启动');
    await expect(log).toContainText('正在检查工作区。');
    await expect(log).toContainText('检查完成。');
    const topology = overview.getByRole('region', { name: '子代理 4' });
    const context = overview.locator('.run-context');
    for (const section of [context, topology]) {
      await expect(section).toHaveCSS('border-top-width', '1px');
      await expect(section).toHaveCSS('border-left-width', '0px');
    }
    expect((await context.boundingBox())!.y).toBeLessThan((await topology.boundingBox())!.y);
    await expect(topology.locator('.run-agent-root')).toHaveText('主代理');
    await expect(topology.locator('.run-agent-tree > ul > li')).toHaveCount(3);
    const explore = topology.locator('.run-agent-tree > ul > li').filter({ hasText: 'Explore' });
    await expect(explore.locator('ul')).toContainText('Verifier');
    await expect(topology.locator('.run-agent-node', { hasText: '查询北京天气' })).toContainText('已完成');
    const shanghai = topology.locator('.run-agent-node', { hasText: '查询上海天气' });
    await expect(shanghai).toHaveCount(1);
    await expect(shanghai).toContainText('运行中');
    await expect(topology).not.toContainText('后台命令');
    await expect(assistant).toHaveCount(1);
    const logBounds = await log.boundingBox();
    const overviewBounds = await overview.boundingBox();
    expect(logBounds!.x + logBounds!.width).toBeLessThan(overviewBounds!.x);
    await log.evaluate(node => { node.scrollTop = 0; });
    await log.hover();
    await window.mouse.wheel(0, 450);
    await expect.poll(() => log.evaluate(node => node.scrollTop)).toBeGreaterThan(0);
    expect((await overview.boundingBox())?.y).toBe(overviewBounds!.y);

    await window.locator('.rail-settings').click();
    await window.getByRole('button', { name: '外观', exact: true }).click();
    await window.getByLabel('主题', { exact: true }).click();
    await window.getByRole('option', { name: 'GitHub Light' }).click();
    await window.locator('.modal-close').click();
    await expect(overview).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    const track = await context.locator('.run-context-bar').evaluate(node => getComputedStyle(node).backgroundColor);
    expect(track).not.toBe('rgb(255, 255, 255)');
    await expect(context.locator('.run-context-free')).toHaveCSS('background-color', track);
  });

  test('opens a centered workspace prompt when starting a run without a workspace', async () => {
    const runButton = window.getByRole('button', { name: '运行工作流' });
    await runButton.click();
    const prompt = window.getByRole('dialog', { name: '选择工作区' });
    await expect(prompt).toBeVisible();
    await expect(prompt).toContainText('运行工作流需要先选择工作区。');
    const offset = await prompt.evaluate(dialog => {
      const bounds = dialog.getBoundingClientRect();
      return [bounds.x + bounds.width / 2 - innerWidth / 2, bounds.y + bounds.height / 2 - innerHeight / 2];
    });
    expect(offset.every(value => Math.abs(value) <= 1)).toBe(true);
    await window.keyboard.press('Escape');
    await expect(prompt).toBeHidden();
    await expect(runButton).toBeFocused();

    const directory = test.info().outputPath('workspace');
    await mkdir(directory, { recursive: true });
    await app.evaluate(({ dialog }, selected) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selected] });
    }, directory);
    await runButton.click();
    await prompt.getByRole('button', { name: '打开工作区' }).click();
    await expect(prompt).toBeHidden();
    await expect(window.locator('.workspace-pill')).toHaveText(directory);
  });

  test('restores the backend URL and session mode from legacy settings', async () => {
    const savedUrl = fixture.url + '/';
    await window.evaluate(url => {
      localStorage.setItem('workbench.opsbotUrl', JSON.stringify(url));
      localStorage.setItem('workbench.runtime', JSON.stringify('opsbot-session'));
    }, savedUrl);
    await window.reload();
    await expect(window.getByLabel('运行时', { exact: true })).toHaveValue('session');
    await window.locator('.rail-settings').click();
    await window.getByRole('button', { name: '常规' }).click();
    await expect(window.getByLabel('Workflow Controller 地址')).toHaveValue(savedUrl);
    await expect.poll(() => window.evaluate(() => globalThis.window.executionBackend.getBaseUrl())).toBe(fixture.url);
  });

  test('reconnects when the execution backend URL is changed in settings', async () => {
    const defaultApp = await electron.launch({
      args: ['--no-sandbox', `--user-data-dir=${test.info().outputPath('reconnect-profile')}`, path.resolve('.vite/build/main.js')],
      // Point the app at an unreachable port so the boot-time list fails
      // deterministically, independent of any backend running on the host.
      env: { ...process.env, EXECUTION_BACKEND_NO_AUTOSTART: '1', EXECUTION_BACKEND_BASE_URL: 'http://127.0.0.1:1' },
    });
    const defaultWindow = await defaultApp.firstWindow();
    await defaultWindow.waitForLoadState('domcontentloaded');
    await expect(defaultWindow.locator('.app-shell')).toBeVisible({ timeout: 10_000 });
    await expect(defaultWindow.locator('.run-list-error')).toContainText('无法连接 Workflow Controller', { timeout: 20_000 });
    await defaultWindow.locator('.rail-settings').click();
    await defaultWindow.getByRole('button', { name: '常规' }).click();
    await defaultWindow.getByLabel('Workflow Controller 地址').fill(fixture.url);
    await expect.poll(() => defaultWindow.evaluate(() => localStorage.getItem('workbench.executionBackendUrl')))
      .toBe(JSON.stringify(fixture.url));
    await defaultWindow.locator('.modal-close').click();
    await expect(defaultWindow.getByRole('option', { name: /workflow\.md/ })).toBeVisible();
    await defaultApp.close();
  });
});
