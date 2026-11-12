import { app, BrowserWindow, ipcMain, type WebContents } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { stopAllExecutionPolls } from './executionBackend/events';
import { registerExecutionBackendIpc } from './executionBackend/ipc';
import { attachInsightViewTo, hideInsight, showInsight, updateInsightBounds, type InsightBounds } from './observability/insightView';
import { stopInsightIfStarted } from './observability/insightService';
import { WorkspaceManager } from './workspaceManager';
import { stopExecutionBackendIfStarted } from './executionBackend/lifecycle';
import { registerStartupIpc } from './startup';

if (started) app.quit();

let splashWindow: BrowserWindow | undefined;
let workbenchWindow: BrowserWindow | undefined;
let quitting = false;
const workspaces = new WorkspaceManager(id => {
  if (workbenchWindow && !workbenchWindow.isDestroyed()) {
    workbenchWindow.webContents.send('workspace:disconnected', id);
  }
});
const SPLASH_WIDTH = 640;
const SPLASH_HEIGHT = 390;
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
  splashWindow?.webContents.send('startup:workbench-failed', message);
  workspaces.unlock();
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
  workspaces.lock();
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
  const isStartup = (sender: WebContents): boolean => sender === splashWindow?.webContents && !workbenchWindow && !quitting;
  registerStartupIpc(workspaces, isStartup, (sender, state) => {
    if (quitting || !splashWindow || sender !== splashWindow.webContents) return;
    if (state.execution.phase === 'ready' && state.insight.phase === 'ready') {
      createWorkbench(sender);
      return;
    }
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
  workspaces.register(sender => sender === workbenchWindow?.webContents, isStartup);
  registerExecutionBackendIpc(input => workspaces.prepareRun(input), () => workspaces.insightTarget());
  ipcMain.handle('insight:show', (_event, path: string, bounds: InsightBounds, isDark: boolean) => {
    return showInsight(path, bounds, isDark, workspaces.insightTarget());
  });
  ipcMain.handle('insight:update-bounds', (_event, bounds: InsightBounds) => { updateInsightBounds(bounds); });
  ipcMain.handle('insight:hide', () => { hideInsight(); });
  createSplash();
  app.on('activate', () => { if (!quitting && !splashWindow && !workbenchWindow) createSplash(); });
});

app.on('before-quit', () => {
  quitting = true;
  workspaces.close();
  stopAllExecutionPolls();
  stopExecutionBackendIfStarted();
  stopInsightIfStarted();
});

app.on('window-all-closed', () => {
  stopAllExecutionPolls();
  workspaces.release();
  if (process.platform !== 'darwin') app.quit();
});
