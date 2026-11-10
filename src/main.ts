import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import started from 'electron-squirrel-startup';
import {
  stopAllExecutionPolls,
  subscribeExecutionEvents,
  unsubscribeExecutionEvents,
} from './executionEvents';
import {
  getRun,
  getRunSessions,
  getInsightStatus,
  getBackendBaseUrl,
  importSessionToInsight,
  injectSessionPrompt,
  listRuns,
  setBackendBaseUrl,
  startWorkflowRun,
  startSessionRun,
  stopRun,
  listProviders,
  saveProviders,
  deleteProvider,
  activateProvider,
  testProvider,
  testProviderKey,
} from './executionBackendHttp';
import { attachInsightViewTo, hideInsight, showInsight, updateInsightBounds, type InsightBounds } from './insightView';
import { walkWorkspace } from './workspaceFiles';
import { ensureExecutionBackendRunning, stopExecutionBackendIfStarted } from './executionBackendService';
import type { CreateRunInput } from './shared/protocol';
import type { ProviderKeyInput } from './shared/executionBackendApi';

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

const createWindow = (): void => {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    void window.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    void window.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }
  attachInsightViewTo(window);
  window.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`[renderer] failed to load ${validatedURL}: ${errorCode} ${errorDescription}`);
  });
  window.webContents.on('render-process-gone', (_event, details) => {
    console.error(`[renderer] process exited: ${details.reason}`);
  });
}

app.whenReady().then(() => {
  void ensureExecutionBackendRunning();
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
  ipcMain.handle('execution:start-run', (_event, input: CreateRunInput) => input.runtime === 'session' ? startSessionRun(input) : startWorkflowRun(input));
  ipcMain.handle('execution:list-runs', () => listRuns());
  ipcMain.handle('execution:get-run', (_event, runId: string) => getRun(runId));
  ipcMain.handle('execution:cancel-run', (_event, runId: string) => stopRun(runId));
  ipcMain.handle('execution:set-base-url', (_event, url: string) => { setBackendBaseUrl(url); });
  ipcMain.handle('execution:get-base-url', () => getBackendBaseUrl());
  ipcMain.handle('execution:get-run-sessions', (_event, runId: string) => getRunSessions(runId));
  ipcMain.handle('execution:inject-prompt', (_event, runId: string, sessionId: string, prompt: string) => injectSessionPrompt(runId, sessionId, prompt));
  ipcMain.handle('execution:import-to-insight', (_event, sessionId: string) => importSessionToInsight(sessionId));
  ipcMain.handle('execution:insight-status', () => getInsightStatus());
  ipcMain.handle('execution:list-providers', () => listProviders());
  ipcMain.handle('execution:save-providers', (_event, keys: ProviderKeyInput[]) => saveProviders(keys));
  ipcMain.handle('execution:delete-provider', (_event, providerIndex: number) => deleteProvider(providerIndex));
  ipcMain.handle('execution:activate-provider', (_event, providerIndex: number) => activateProvider(providerIndex));
  ipcMain.handle('execution:test-provider', (_event, providerIndex: number) => testProvider(providerIndex));
  ipcMain.handle('execution:test-provider-key', (_event, key: string, model: string, baseUrl: string, runtime: string | undefined) => testProviderKey(key, model, baseUrl, runtime));
  ipcMain.handle('insight:show', (_event, path: string, bounds: InsightBounds, isDark: boolean) => { showInsight(path, bounds, isDark); });
  ipcMain.handle('insight:update-bounds', (_event, bounds: InsightBounds) => { updateInsightBounds(bounds); });
  ipcMain.handle('insight:hide', () => { hideInsight(); });
  ipcMain.on('execution:subscribe-events', (_event, runId: string) => subscribeExecutionEvents(runId));
  ipcMain.on('execution:unsubscribe-events', (_event, runId: string) => unsubscribeExecutionEvents(runId));
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('before-quit', () => {
  stopAllExecutionPolls();
  stopExecutionBackendIfStarted();
});

app.on('window-all-closed', () => {
  stopAllExecutionPolls();
  if (process.platform !== 'darwin') app.quit();
});
