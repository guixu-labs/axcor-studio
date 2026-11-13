import { app, BrowserWindow, ipcMain, nativeTheme, screen, type WebContents } from 'electron';
import path from 'node:path';
import workspaceHelper from '../remote/axcor-workspace-helper?raw';
import started from 'electron-squirrel-startup';
import { stopAllExecutionPolls } from './executionBackend/events';
import { registerExecutionBackendIpc } from './executionBackend/ipc';
import {
  attachInsightViewTo,
  hideInsight,
  showInsight,
  updateInsightBounds,
  type InsightBounds,
} from './observability/insightView';
import { stopInsightIfStarted } from './observability/insightService';
import { WorkspaceManager } from './workspaceManager';
import { stopExecutionBackendIfStarted } from './executionBackend/lifecycle';
import { registerStartupIpc } from './startup';
import type { RemoteWorkspaceConfig } from './shared/workspace';

if (started) app.quit();

let splashWindow: BrowserWindow | undefined;
let remoteWorkspaceWindow: BrowserWindow | undefined;
let selectedRemoteWorkspace: RemoteWorkspaceConfig | undefined;
let workbenchWindow: BrowserWindow | undefined;
let quitting = false;
const workspaces = new WorkspaceManager(workspaceHelper, id => {
  if (workbenchWindow && !workbenchWindow.isDestroyed()) {
    workbenchWindow.webContents.send('workspace:disconnected', id);
  }
}, (id, change) => {
  if (workbenchWindow && !workbenchWindow.isDestroyed()) {
    workbenchWindow.webContents.send('workspace:files-changed', id, change);
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

function loadRenderer(window: BrowserWindow, page?: 'startup' | 'remote'): Promise<void> {
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    const url = new URL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    if (page) url.searchParams.set(page, '1');
    return window.loadURL(url.href);
  }
  const entry = path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`);
  return window.loadFile(entry, page ? { query: { [page]: '1' } } : undefined);
}

function createSplash(): void {
  nativeTheme.themeSource = 'dark';
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
  void loadRenderer(window, 'startup').catch(error => {
    console.error('[startup]', error);
    if (!quitting) app.quit();
  });
}

function chooseRemoteWorkspace(parent: BrowserWindow, english: boolean): Promise<RemoteWorkspaceConfig | undefined> {
  const { workArea } = screen.getDisplayMatching(parent.getBounds());
  const window = new BrowserWindow({
    parent,
    title: english ? 'Open remote workspace' : '打开远程工作区',
    width: Math.min(440, workArea.width),
    height: Math.min(480, workArea.height),
    useContentSize: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    autoHideMenuBar: true,
    show: false,
    backgroundColor: '#121522',
    webPreferences,
  });
  remoteWorkspaceWindow = window;
  window.center();
  window.once('ready-to-show', () => window.show());
  return new Promise((resolve, reject) => {
    window.once('closed', () => {
      remoteWorkspaceWindow = undefined;
      const config = selectedRemoteWorkspace;
      selectedRemoteWorkspace = undefined;
      resolve(config);
    });
    void loadRenderer(window, 'remote').catch(error => {
      if (window.isDestroyed()) return;
      reject(error);
      window.destroy();
    });
  });
}

function showWorkbenchFailure(window: BrowserWindow, message: string): void {
  if (window !== workbenchWindow || quitting) return;
  nativeTheme.themeSource = 'dark';
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
  ipcMain.on('appearance:color-scheme', (event, scheme: unknown) => {
    if (event.sender !== workbenchWindow?.webContents || event.senderFrame !== event.sender.mainFrame) return;
    if (scheme === 'light' || scheme === 'dark') nativeTheme.themeSource = scheme;
  });
  const isStartup = (sender: WebContents): boolean =>
    sender === splashWindow?.webContents && !workbenchWindow && !quitting;
  const isRemoteChooser = (sender: WebContents): boolean =>
    sender === remoteWorkspaceWindow?.webContents && !quitting;
  ipcMain.handle('startup:choose-remote', (event, english: boolean) => {
    if (
      !splashWindow ||
      !isStartup(event.sender) ||
      event.senderFrame !== event.sender.mainFrame ||
      remoteWorkspaceWindow
    ) {
      throw new Error('Invalid remote workspace request.');
    }
    return chooseRemoteWorkspace(splashWindow, english);
  });
  ipcMain.on('startup:remote-submit', (event, config: RemoteWorkspaceConfig) => {
    if (!remoteWorkspaceWindow || !isRemoteChooser(event.sender) || event.senderFrame !== event.sender.mainFrame)
      return;
    selectedRemoteWorkspace = config;
    remoteWorkspaceWindow.close();
  });
  ipcMain.on('startup:remote-resize', (event, height: number) => {
    const window = remoteWorkspaceWindow;
    if (
      !window ||
      !isRemoteChooser(event.sender) ||
      event.senderFrame !== event.sender.mainFrame ||
      !Number.isFinite(height) ||
      height <= 0
    )
      return;
    const bounds = window.getBounds();
    const [width, contentHeight] = window.getContentSize();
    const { workArea } = screen.getDisplayMatching(bounds);
    const frameHeight = bounds.height - contentHeight;
    const nextHeight = Math.max(1, Math.min(Math.ceil(height), workArea.height - frameHeight));
    if (nextHeight === contentHeight) return;
    window.setContentSize(width, nextHeight);
    const maxY = workArea.y + workArea.height - nextHeight - frameHeight;
    if (bounds.y > maxY) window.setPosition(bounds.x, maxY);
  });
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
  workspaces.register(sender => sender === workbenchWindow?.webContents, isRemoteChooser);
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
