import { app, BrowserWindow, dialog, ipcMain, type WebContents } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import started from 'electron-squirrel-startup';
import { stopAllExecutionPolls } from './executionBackend/events';
import { registerExecutionBackendIpc } from './executionBackend/ipc';
import { attachInsightViewTo, hideInsight, showInsight, updateInsightBounds, type InsightBounds } from './observability/insightView';
import { stopInsightIfStarted } from './observability/insightService';
import { walkWorkspace } from './workspaceFiles';
import { stopExecutionBackendIfStarted } from './executionBackend/lifecycle';
import { registerStartupIpc } from './startup';

if (started) app.quit();

let selectedWorkspace: string | undefined = process.env.WORKBENCH_WORKSPACE && existsSync(process.env.WORKBENCH_WORKSPACE) ? path.resolve(process.env.WORKBENCH_WORKSPACE) : undefined;

const workspacePath = (filePath: string): string => {
  if (!selectedWorkspace) throw new Error('No workspace selected');
  const root = path.resolve(selectedWorkspace);
  const candidate = path.resolve(filePath);
  const relative = path.relative(root, candidate);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('File is outside the selected workspace');
  return candidate;
};

let splashWindow: BrowserWindow | undefined;
let workbenchWindow: BrowserWindow | undefined;
let quitting = false;
const SPLASH_WIDTH = 640;
const SPLASH_HEIGHT = 332;
const SPLASH_RETRY_HEIGHT = 396;
const webPreferences = {
  preload: path.join(__dirname, 'preload.js'),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
};

function loadRenderer(window: BrowserWindow, startup = false): Promise<void> {
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    const url = new URL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    if (startup) url.searchParams.set('startup', '1');
    return window.loadURL(url.href);
  }
  const entry = path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`);
  return window.loadFile(entry, startup ? { query: { startup: '1' } } : undefined);
}

function createSplash(): void {
  const window = new BrowserWindow({
    title: 'Axcor Studio',
    width: SPLASH_WIDTH,
    height: SPLASH_HEIGHT,
    frame: false,
    resizable: false,
    show: false,
    backgroundColor: '#141726',
    webPreferences,
  });
  splashWindow = window;
  window.once('ready-to-show', () => window.show());
  window.on('closed', () => {
    splashWindow = undefined;
    if (!quitting && !workbenchWindow?.isVisible()) app.quit();
  });
  void loadRenderer(window, true).catch(error => {
    console.error('[startup]', error);
    if (!quitting) app.quit();
  });
}

function showWorkbenchFailure(window: BrowserWindow, message: string): void {
  if (window !== workbenchWindow || quitting) return;
  splashWindow?.setContentSize(SPLASH_WIDTH, SPLASH_RETRY_HEIGHT);
  splashWindow?.webContents.send('startup:workbench-failed', message);
  window.destroy();
}

function createWorkbench(sender: WebContents): void {
  if (quitting || sender !== splashWindow?.webContents || workbenchWindow) return;
  const window = new BrowserWindow({
    backgroundColor: '#0b0d18',
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    webPreferences,
  });
  workbenchWindow = window;
  window.on('closed', () => { workbenchWindow = undefined; });
  window.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`[renderer] failed to load ${validatedURL}: ${errorCode} ${errorDescription}`);
  });
  window.webContents.on('render-process-gone', (_event, details) => {
    console.error(`[renderer] process exited: ${details.reason}`);
    if (splashWindow) showWorkbenchFailure(window, details.reason);
  });
  void loadRenderer(window).catch(error => showWorkbenchFailure(window, String(error)));
}

app.whenReady().then(() => {
  registerStartupIpc((sender, state) => {
    if (quitting || !splashWindow || sender !== splashWindow.webContents) return;
    if (state.execution.phase === 'ready' && state.insight.phase === 'ready') {
      createWorkbench(sender);
      return;
    }
    const failed = state.execution.phase === 'failed' || state.insight.phase === 'failed';
    splashWindow.setContentSize(SPLASH_WIDTH, failed ? SPLASH_RETRY_HEIGHT : SPLASH_HEIGHT);
  });
  ipcMain.on('startup:workbench-loaded', ({ sender }, error?: string) => {
    const window = workbenchWindow;
    if (quitting || !window || sender !== window.webContents || !splashWindow) return;
    if (error) {
      showWorkbenchFailure(window, error);
      return;
    }
    attachInsightViewTo(window);
    window.show();
    splashWindow.destroy();
  });
  ipcMain.handle('workspace:choose', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    selectedWorkspace = result.canceled ? undefined : result.filePaths[0];
    return selectedWorkspace;
  });
  ipcMain.handle('workspace:get', () => selectedWorkspace);
  ipcMain.handle('workspace:list-tree', async () => {
    if (!selectedWorkspace) throw new Error('No workspace selected');
    return walkWorkspace(selectedWorkspace);
  });
  ipcMain.handle('workspace:read-file', (_event, fileName: string) => fs.readFile(workspacePath(path.join(selectedWorkspace ?? '', fileName)), 'utf8'));
  ipcMain.handle('workspace:write-file', (_event, fileName: string, content: string) => fs.writeFile(workspacePath(path.join(selectedWorkspace ?? '', fileName)), content, 'utf8'));
  registerExecutionBackendIpc();
  ipcMain.handle('insight:show', (_event, path: string, bounds: InsightBounds, isDark: boolean) => showInsight(path, bounds, isDark));
  ipcMain.handle('insight:update-bounds', (_event, bounds: InsightBounds) => { updateInsightBounds(bounds); });
  ipcMain.handle('insight:hide', () => { hideInsight(); });
  createSplash();
  app.on('activate', () => { if (!quitting && !splashWindow && !workbenchWindow) createSplash(); });
});

app.on('before-quit', () => {
  quitting = true;
  stopAllExecutionPolls();
  stopExecutionBackendIfStarted();
  stopInsightIfStarted();
});

app.on('window-all-closed', () => {
  stopAllExecutionPolls();
  if (process.platform !== 'darwin') app.quit();
});
