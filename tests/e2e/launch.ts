import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
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

type LaunchOptions = NonNullable<Parameters<typeof electron.launch>[0]> & {
  executionUrl?: string;
  insightPort?: number;
  workspace?: string;
};

export async function launchWorkbench({
  executionUrl, insightPort, workspace, args = [], ...options
}: LaunchOptions = {}): Promise<ElectronApplication> {
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
  let app: ElectronApplication | undefined;
  try {
    app = await electron.launch({
      ...options,
      args: [
        ...args, path.resolve('dist/e2e/build/main.js'),
        `--fixture-controller-port=${executionUrl ? new URL(executionUrl).port : port}`,
        `--fixture-insight-port=${insightPort ?? port}`,
      ],
    });
    app.process().once('exit', () => server.close());
    if (workspace) {
      const page = await workbenchPage(app);
      await app.evaluate(({ dialog }, directory) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [directory] });
      }, workspace);
      await page.locator('.workspace-open-button').click();
      await expect(page.locator('.workspace-open-button')).toHaveCount(0);
    }
    return app;
  } catch (error) {
    await app?.close();
    server.close();
    throw error;
  }
}
