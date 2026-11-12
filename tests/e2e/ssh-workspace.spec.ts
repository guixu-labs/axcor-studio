import { test, expect } from '@playwright/test';
import type { ElectronApplication } from 'playwright';
import { chmod, mkdir, readFile, realpath, rename, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import http from 'node:http';
import net, { type AddressInfo } from 'node:net';
import path from 'node:path';
import { launchWorkbench, workbenchPage } from './launch';

test('opens an SSH workspace, saves and runs remotely, then reconnects with its draft and log cursor', async () => {
  const python = spawnSync('python3', ['-c', 'import sys; print(sys.executable)'], { encoding: 'utf8' });
  test.skip(process.platform === 'win32' || python.status !== 0, 'The SSH fixture uses the Python file helper.');
  const scratch = test.info().outputPath();
  const workspace = path.join(await realpath(path.dirname(scratch)), path.basename(scratch), 'remote workspace');
  const bin = path.join(scratch, 'bin');
  const sshDir = path.join(scratch, '.ssh');
  const pidFile = path.join(scratch, 'ssh.pid');
  const insightPidFile = path.join(scratch, 'insight.pid');
  const controllerPidFile = path.join(scratch, 'controller.pid');
  await Promise.all([mkdir(workspace, { recursive: true }), mkdir(bin, { recursive: true }), mkdir(sshDir, { recursive: true })]);
  const sshConfig = path.join(sshDir, 'config');
  const originalSshConfig = 'Include team.conf\nHost *\n  ServerAliveInterval 10\n';
  await writeFile(sshConfig, originalSshConfig);
  await writeFile(path.join(sshDir, 'team.conf'), 'Host fixture\n  HostName fixture.example\n');
  const file = path.join(workspace, 'workflow.yaml');
  await writeFile(file, 'name: initial\n');
  // Exercise the desktop SSH process boundary with the real file helper and a
  // TCP forwarder. A real host and SSH credentials are not required in CI.
  const ssh = path.join(bin, 'ssh');
  await writeFile(ssh, `#!${process.execPath}
const { spawn } = require('node:child_process');
const { writeFileSync } = require('node:fs');
const net = require('node:net');
const args = process.argv.slice(2);
if (!args.includes('StrictHostKeyChecking=yes') || !args.includes('BatchMode=yes')
    || args.at(-2) !== 'fixture' || args.at(-1) !== 'axcor-workspace-helper --stdio') process.exit(2);
const forwards = args.flatMap((arg, index) => arg === '-L' ? [args[index + 1]] : []);
if (forwards.length !== 2) process.exit(3);
Promise.all(forwards.map(forward => new Promise(resolve => {
  const [localHost, localPort, remoteHost, remotePort] = forward.split(':');
  const listener = net.createServer(socket => {
    const target = net.connect(Number(remotePort), remoteHost);
    socket.pipe(target).pipe(socket);
    socket.on('error', () => target.destroy());
    target.on('error', () => socket.destroy());
    socket.on('close', () => target.destroy());
    target.on('close', () => socket.destroy());
  });
  listener.listen(Number(localPort), localHost, resolve);
}))).then(() => {
  writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));
  const helper = spawn(${JSON.stringify(python.stdout.trim())}, [${JSON.stringify(path.resolve('remote/axcor-workspace-helper'))}, '--stdio'], {
    stdio: 'inherit', env: { ...process.env, HOME: ${JSON.stringify(scratch)}, PATH: ${JSON.stringify(bin)} },
  });
  helper.on('exit', code => process.exit(code ?? 1));
});
`);
  await chmod(ssh, 0o755);
  const insight = path.join(bin, 'context-insight');
  await writeFile(insight, `#!${process.execPath}
const http = require('node:http');
const { writeFileSync } = require('node:fs');
if (process.env.CONTEXT_NO_BROWSER !== '1') process.exit(2);
http.createServer((request, response) => {
  if (request.url === '/api/observe/data?pageSize=1') {
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ items: [] }));
    return;
  }
  response.setHeader('content-type', 'text/html');
  response.end('<h1>Remote Insight</h1>');
}).listen(Number(process.env.CONTEXT_INSIGHT_PORT), '127.0.0.1', () => {
  writeFileSync(${JSON.stringify(insightPidFile)}, String(process.pid));
});
`);
  await chmod(insight, 0o755);
  const insightReservation = net.createServer();
  await new Promise<void>(resolve => insightReservation.listen(0, '127.0.0.1', resolve));
  const insightPort = String((insightReservation.address() as AddressInfo).port);
  const occupied = http.createServer((_request, response) => response.writeHead(503).end());
  await new Promise<void>(resolve => occupied.listen(0, '127.0.0.1', resolve));
  const controllerPort = String((occupied.address() as AddressInfo).port);
  await new Promise<void>(resolve => insightReservation.close(() => resolve()));
  const closeOccupied = async (): Promise<void> => {
    if (!occupied.listening) return;
    occupied.closeAllConnections();
    await new Promise<void>(resolve => occupied.close(() => resolve()));
  };
  const insightImports: string[] = [];

  const posts: Record<string, unknown>[] = [];
  const cursors: Array<string | null> = [];
  let stopped = false;
  let sessionStarted = false;
  const run = {
    run_id: 'graph-remote', kind: 'workflow', format: 'graph-yaml@1', status: 'running',
    program_ref: 'workflow.yaml', label: 'Remote Graph', work_dir: workspace, params: {},
    created_at: '2026-11-12T01:00:00Z', member_count: 1, running_count: 1,
  };
  const session = {
    id: 'session-remote', name: 'Remote session', state: 'running', created_at_iso: run.created_at,
  };
  const server = http.createServer(async (request, response) => {
    response.setHeader('content-type', 'application/json');
    const reply = (value: unknown): void => { response.end(JSON.stringify(value)); };
    const url = new URL(request.url ?? '/', 'http://fixture');
    const current = stopped ? { ...run, status: 'stopped' } : run;
    if (request.method === 'POST') {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      if (url.pathname === '/api/v1/insight/import') {
        insightImports.push(url.searchParams.get('session_id') ?? '');
        reply({ ok: true, insightUrl: '/insight/session/session-remote' });
        return;
      }
      if (url.pathname === '/api/v1/runs') {
        posts.push(JSON.parse(Buffer.concat(chunks).toString()));
        reply({ run_id: run.run_id });
        return;
      }
      if (url.pathname === '/api/v1/sessions/start') {
        posts.push(JSON.parse(Buffer.concat(chunks).toString()));
        sessionStarted = true;
        reply({ session_id: session.id });
        return;
      }
      if (url.pathname === '/api/v1/runs/graph-remote/stop') {
        stopped = true;
        reply({ accepted: true });
        return;
      }
    } else {
      if (url.pathname === '/api/v1/runs') { reply({ runs: posts.length ? [current] : [] }); return; }
      if (url.pathname === '/api/v1/runs/graph-remote') { reply({ run: current, sessions: [] }); return; }
      if (url.pathname === '/api/v1/runs/graph-remote/events') {
        const cursor = url.searchParams.get('cursor');
        cursors.push(cursor);
        reply({ next_cursor: 'first-event', limit: 200, events: cursor ? [] : [{
          id: 1, run_id: run.run_id, timestamp: run.created_at, event_type: 'process_output',
          data: { message: 'server-log' }, source: 'run_events',
        }] });
        return;
      }
      if (url.pathname === '/api/v1/sessions') { reply(sessionStarted ? [session] : []); return; }
      if (url.pathname === '/api/v1/sessions/session-remote') { reply(session); return; }
      if (url.pathname === '/api/v1/events') { reply({ cursor: 'session-event', events: [] }); return; }
      if (url.pathname === '/api/v1/auth/status') {
        reply({ providers: [{ index: 1, status: 'active', runtime: 'claude_sdk', model: 'fixture-model' }] });
        return;
      }
    }
    response.writeHead(404).end();
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const controller = path.join(bin, 'workflow-controller');
  const healthyController = path.join(bin, 'workflow-controller-ready');
  await writeFile(healthyController, `#!${process.execPath}
const net = require('node:net');
const { writeFileSync } = require('node:fs');
const args = process.argv.slice(2);
const port = Number(args[args.indexOf('--port') + 1]);
if (args[0] !== 'web' || !args.includes('--no-open') || args[args.indexOf('--host') + 1] !== '127.0.0.1'
    || process.env.WORKFLOW_CONTROLLER_INSIGHT_PORT !== ${JSON.stringify(insightPort)}
    || port !== ${Number(controllerPort)}) process.exit(2);
net.createServer(socket => {
  const target = net.connect(${(server.address() as AddressInfo).port}, '127.0.0.1');
  socket.pipe(target).pipe(socket);
  socket.on('error', () => target.destroy());
  target.on('error', () => socket.destroy());
  socket.on('close', () => target.destroy());
  target.on('close', () => socket.destroy());
}).listen(port, '127.0.0.1', () => writeFileSync(${JSON.stringify(controllerPidFile)}, String(process.pid)));
`, { mode: 0o755 });
  const launch = () => launchWorkbench({
    args: ['--no-sandbox', `--user-data-dir=${path.join(scratch, 'profile')}`],
    executionUrl: 'http://127.0.0.1:1',
    insightPort: 1,
    env: { ...process.env, HOME: scratch, PATH: bin + path.delimiter + process.env.PATH },
  });
  let app: ElectronApplication | undefined;
  try {
    app = await launch();
    const startup = await app.firstWindow();
    await startup.getByRole('button', { name: '打开远程工作区' }).click();
    const form = startup.getByRole('dialog', { name: '打开远程工作区' });
    const configuredHosts = form.getByLabel('SSH 配置中的主机');
    await expect(configuredHosts.locator('option')).toHaveText(['选择已配置的主机', 'fixture']);
    await form.getByLabel('SSH 主机').fill('ubuntu@lab.example');
    await form.getByLabel('SSH 端口', { exact: true }).fill('2222');
    await form.locator('summary', { hasText: '保存到 SSH 配置' }).click();
    await form.getByLabel('SSH 别名').fill('lab');
    await form.getByRole('button', { name: '保存到 SSH 配置' }).click();
    await expect(configuredHosts).toHaveValue('lab');
    const updatedConfig = await readFile(sshConfig, 'utf8');
    expect(updatedConfig).toContain('Host lab\n  HostName lab.example\n  User ubuntu\n  Port 2222');
    expect(updatedConfig.endsWith(originalSshConfig)).toBe(true);
    await configuredHosts.selectOption('fixture');
    await expect(form.getByLabel('SSH 主机')).toHaveValue('fixture');
    await form.getByLabel('远程目录').fill(workspace);
    await form.getByLabel('远程 Insight 端口').fill(insightPort);
    await form.getByLabel('Controller 端口').fill(controllerPort);
    await form.getByRole('button', { name: '连接', exact: true }).click();
    const controllerRow = startup.locator('.startup-services li', { hasText: 'Workflow Controller' });
    const retry = controllerRow.getByRole('button', { name: '重试 Workflow Controller' });
    await expect(controllerRow).toContainText('端口已被占用 · ' + controllerPort);
    await closeOccupied();
    await retry.click();
    await expect(controllerRow).toContainText('找不到启动命令或解释器，请检查安装和 PATH · workflow-controller');

    await writeFile(controller, '#!/bin/sh\nexit 7\n', { mode: 0o755 });
    await retry.click();
    await expect(controllerRow).toContainText('进程在启动时退出');
    await expect(controllerRow).toContainText(`controller-${controllerPort}.log`);

    await rename(healthyController, controller);
    await retry.click();
    const page = await workbenchPage(app, false);
    const originalControllerPid = await readFile(controllerPidFile, 'utf8');
    const originalInsightPid = await readFile(insightPidFile, 'utf8');
    const edit = async (value: string): Promise<void> => {
      await page.locator('.monaco-editor').click();
      await page.keyboard.press('ControlOrMeta+a');
      await page.keyboard.type(value);
      await expect(page.getByRole('tab', { name: 'workflow.yaml' })).toHaveAttribute('aria-description', '有未保存的修改');
    };
    await edit('name: saved before graph');
    await page.getByRole('button', { name: '运行', exact: true }).click();
    await page.getByRole('button', { name: '运行工作流' }).click();
    await expect.poll(() => posts[0]).toMatchObject({ program_path: file, work_dir: workspace });
    expect(await readFile(file, 'utf8')).toBe('name: saved before graph');
    await expect(page.locator('.run-log-panel')).toContainText('server-log');
    await expect.poll(() => cursors.includes('first-event')).toBe(true);

    await page.getByRole('tab', { name: 'workflow.yaml' }).click();
    await edit('name: unsaved draft');
    await writeFile(file, 'name: external edit');
    await page.getByRole('button', { name: '运行工作流' }).click();
    await expect(page.locator('.run-list-error')).toContainText('File changed on the server');
    expect(posts).toHaveLength(1);
    expect(await readFile(file, 'utf8')).toBe('name: external edit');
    process.kill(Number(await readFile(pidFile, 'utf8')));
    await expect(page.locator('.status-bar')).toContainText('SSH 已断开');
    await expect(page.getByRole('button', { name: '运行工作流' })).toBeDisabled();
    const previousPolls = cursors.length;
    await page.getByRole('button', { name: '重新连接' }).click();
    await expect(page.locator('.status-bar')).toContainText('SSH · fixture');
    await expect(page.locator('.view-lines')).toContainText('unsaved draft');
    await expect.poll(() => cursors.slice(previousPolls)).toContain('first-event');

    await page.getByRole('tab', { name: 'Remote Graph' }).click();
    await page.getByRole('button', { name: '停止', exact: true }).click();
    await page.getByRole('dialog', { name: '停止工作流？' }).getByRole('button', { name: '停止' }).click();
    await expect.poll(() => stopped).toBe(true);

    await page.getByLabel('运行时', { exact: true }).selectOption('session');
    await page.getByLabel('提示词', { exact: true }).fill('Run on the server');
    await page.getByLabel('模型', { exact: true }).selectOption('fixture-model');
    await page.getByRole('button', { name: '运行工作流' }).click();
    await expect.poll(() => posts[1]).toMatchObject({ project_dir: workspace, prompt: 'Run on the server' });
    await expect(page.getByRole('tab', { name: 'Remote session' })).toBeVisible();
    const remoteInsightLoaded = async (route: string): Promise<boolean> =>
      app!.evaluate(({ webContents }, target) => webContents.getAllWebContents().some(web =>
        web.getURL().endsWith(target) && !web.isLoadingMainFrame()), route);
    await page.getByRole('button', { name: '在 Insight 中查看' }).click();
    await expect.poll(() => insightImports).toEqual(['session-remote']);
    await expect.poll(() => remoteInsightLoaded('/session/session-remote')).toBe(true);

    await page.getByRole('button', { name: '工作台', exact: true }).click();
    await expect(page.locator('.workspace-explorer').getByRole('button', { name: /打开.*工作区/ })).toHaveCount(0);
    expect(await readFile(file, 'utf8')).toBe('name: external edit');

    await app.close();
    app = await launch();
    const restart = await app.firstWindow();
    await restart.getByRole('button', { name: '打开远程工作区' }).click();
    const reopenedForm = restart.getByRole('dialog', { name: '打开远程工作区' });
    await expect(reopenedForm.getByLabel('SSH 主机')).toHaveValue('fixture');
    await reopenedForm.getByRole('button', { name: '连接', exact: true }).click();
    const reopened = await workbenchPage(app, false);
    await reopened.getByRole('button', { name: '运行', exact: true }).click();
    await reopened.getByRole('option', { name: /Remote session/ }).click();
    await expect(reopened.getByRole('tab', { name: 'Remote session' })).toBeVisible();
    await reopened.getByRole('button', { name: '在 Insight 中查看' }).click();
    await expect.poll(() => remoteInsightLoaded('/session/session-remote')).toBe(true);
    expect(await readFile(insightPidFile, 'utf8')).toBe(originalInsightPid);
    expect(await readFile(controllerPidFile, 'utf8')).toBe(originalControllerPid);
    expect(posts).toHaveLength(2);
  } finally {
    await app?.close();
    await closeOccupied();
    for (const pidPath of [controllerPidFile, insightPidFile]) {
      const pid = await readFile(pidPath, 'utf8').catch(() => undefined);
      if (pid) process.kill(Number(pid));
    }
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
