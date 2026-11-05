import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import started from 'electron-squirrel-startup';
import {
  stopAllOpsbotPolls,
  subscribeOpsbotEvents,
  unsubscribeOpsbotEvents,
} from './opsbotClient';
import {
  getOpsbotRun,
  getOpsbotRunSessions,
  getInsightStatus,
  getOpsbotBaseUrl,
  importOpsbotSessionToInsight,
  injectOpsbotSessionPrompt,
  listOpsbotRuns,
  setOpsbotBaseUrl,
  startOpsbotRun,
  startOpsbotSession,
  stopOpsbotRun,
  listProviders,
  saveProviders,
  deleteProvider,
  activateProvider,
  testProvider,
  testProviderKey,
} from './opsbotHttp';
import { attachInsightViewTo, hideInsight, showInsight, updateInsightBounds, type InsightBounds } from './insightView';
import { walkWorkspace } from './workspaceFiles';
import { ensureOpsbotRunning } from './opsbotService';
import type { CreateRunInput } from './shared/protocol';
import type { ProviderKeyInput } from './shared/opsbotApi';

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
  void ensureOpsbotRunning();
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
  ipcMain.handle('opsbot:start-run', (_event, input: CreateRunInput) => input.runtime === 'opsbot-session' ? startOpsbotSession(input) : startOpsbotRun(input));
  ipcMain.handle('opsbot:list-runs', () => listOpsbotRuns());
  ipcMain.handle('opsbot:get-run', (_event, runId: string) => getOpsbotRun(runId));
  ipcMain.handle('opsbot:cancel-run', (_event, runId: string) => stopOpsbotRun(runId));
  ipcMain.handle('opsbot:set-base-url', (_event, url: string) => { setOpsbotBaseUrl(url); });
  ipcMain.handle('opsbot:get-base-url', () => getOpsbotBaseUrl());
  ipcMain.handle('opsbot:get-run-sessions', (_event, runId: string) => getOpsbotRunSessions(runId));
  ipcMain.handle('opsbot:inject-prompt', (_event, runId: string, sessionId: string, prompt: string) => injectOpsbotSessionPrompt(runId, sessionId, prompt));
  ipcMain.handle('opsbot:import-to-insight', (_event, sessionId: string) => importOpsbotSessionToInsight(sessionId));
  ipcMain.handle('opsbot:insight-status', () => getInsightStatus());
  ipcMain.handle('opsbot:list-providers', () => listProviders());
  ipcMain.handle('opsbot:save-providers', (_event, keys: ProviderKeyInput[]) => saveProviders(keys));
  ipcMain.handle('opsbot:delete-provider', (_event, providerIndex: number) => deleteProvider(providerIndex));
  ipcMain.handle('opsbot:activate-provider', (_event, providerIndex: number) => activateProvider(providerIndex));
  ipcMain.handle('opsbot:test-provider', (_event, providerIndex: number) => testProvider(providerIndex));
  ipcMain.handle('opsbot:test-provider-key', (_event, key: string, model: string, baseUrl: string, runtime: string | undefined) => testProviderKey(key, model, baseUrl, runtime));
  ipcMain.handle('insight:show', (_event, path: string, bounds: InsightBounds, isDark: boolean) => { showInsight(path, bounds, isDark); });
  ipcMain.handle('insight:update-bounds', (_event, bounds: InsightBounds) => { updateInsightBounds(bounds); });
  ipcMain.handle('insight:hide', () => { hideInsight(); });
  ipcMain.on('opsbot:subscribe-events', (_event, runId: string) => subscribeOpsbotEvents(runId));
  ipcMain.on('opsbot:unsubscribe-events', (_event, runId: string) => unsubscribeOpsbotEvents(runId));
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => {
  stopAllOpsbotPolls();
  if (process.platform !== 'darwin') app.quit();
});
