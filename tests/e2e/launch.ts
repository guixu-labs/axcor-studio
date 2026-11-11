import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect } from '@playwright/test';
import { _electron as electron, type ElectronApplication, type Page } from 'playwright';

export async function workbenchPage(app: ElectronApplication): Promise<Page> {
  let page: Page | undefined;
  await expect.poll(async () => {
    const url = await app.evaluate(({ BrowserWindow }) => {
      const windows = BrowserWindow.getAllWindows();
      if (windows.length !== 1 || !windows[0].isVisible()) return undefined;
      const current = windows[0].webContents.getURL();
      return new URL(current).searchParams.has('startup') ? undefined : current;
    });
    page = url ? app.windows().find(candidate => !candidate.isClosed() && candidate.url() === url) : undefined;
    return Boolean(page);
  }, { timeout: 10_000 }).toBe(true);
  if (!page) throw new Error('Workbench page did not open');
  return page;
}

export async function launchWorkbench(options: Parameters<typeof electron.launch>[0] = {}): ReturnType<typeof electron.launch> {
  const env = { ...options.env };
  const server = http.createServer((request, response) => {
    response.setHeader('Content-Type', 'application/json');
    if (request.url === '/api/v1/runs') response.end(JSON.stringify({ runs: [] }));
    else if (request.url === '/api/v1/sessions') response.end(JSON.stringify([]));
    else if (request.url === '/api/observe/data?pageSize=1') response.end(JSON.stringify({ items: [] }));
    else response.writeHead(404).end();
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address() as AddressInfo;
  env.EXECUTION_BACKEND_BASE_URL ??= `http://127.0.0.1:${port}`;
  env.CONTEXT_INSIGHT_PORT ??= String(port);
  try {
    const app = await electron.launch({ ...options, env });
    app.process().once('exit', () => server.close());
    return app;
  } catch (error) {
    server.close();
    throw error;
  }
}
