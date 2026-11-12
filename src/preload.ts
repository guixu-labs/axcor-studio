import { contextBridge, ipcRenderer } from 'electron';
import type { RunEvent } from './shared/protocol';
import type { ExecutionBackendBridge } from './shared/executionBackendIpc';
import type { WorkspaceBridge } from './shared/workspace';
import type { StartupBridge, StartupState } from './shared/startup';

const startup: StartupBridge = {
  chooseLocal: () => ipcRenderer.invoke('startup:choose-local'),
  run: (choice, retry) => ipcRenderer.invoke('startup:run', choice, retry),
  onProgress: listener => {
    const handler = (_event: Electron.IpcRendererEvent, state: StartupState): void => listener(state);
    ipcRenderer.on('startup:progress', handler);
    return () => { ipcRenderer.removeListener('startup:progress', handler); };
  },
  workbenchLoaded: error => { ipcRenderer.send('startup:workbench-loaded', error); },
  onWorkbenchFailed: listener => {
    const handler = (_event: Electron.IpcRendererEvent, message: string): void => listener(message);
    ipcRenderer.on('startup:workbench-failed', handler);
    return () => { ipcRenderer.removeListener('startup:workbench-failed', handler); };
  },
};
contextBridge.exposeInMainWorld('startup', startup);

const workbench: WorkspaceBridge = {
  listSshHosts: () => ipcRenderer.invoke('workspace:ssh-hosts'),
  saveSshHost: entry => ipcRenderer.invoke('workspace:ssh-host-save', entry),
  reconnect: () => ipcRenderer.invoke('workspace:reconnect'),
  getWorkspace: () => ipcRenderer.invoke('workspace:get'),
  listTree: id => ipcRenderer.invoke('workspace:list-tree', id),
  readFile: (id, file) => ipcRenderer.invoke('workspace:read-file', id, file),
  writeFile: (id, file, content, version) => ipcRenderer.invoke('workspace:write-file', id, file, content, version),
  onDisconnected: listener => {
    const handler = (_event: Electron.IpcRendererEvent, id: string): void => listener(id);
    ipcRenderer.on('workspace:disconnected', handler);
    return () => { ipcRenderer.removeListener('workspace:disconnected', handler); };
  },
};
contextBridge.exposeInMainWorld('workbench', workbench);

const executionBackend: ExecutionBackendBridge = {
  startRun: input => ipcRenderer.invoke('execution:start-run', input),
  listRuns: () => ipcRenderer.invoke('execution:list-runs'),
  getRun: runId => ipcRenderer.invoke('execution:get-run', runId),
  stopRun: runId => ipcRenderer.invoke('execution:stop-run', runId),
  getRunSessions: runId => ipcRenderer.invoke('execution:get-run-sessions', runId),
  injectPrompt: (runId, sessionId, prompt) => ipcRenderer.invoke('execution:inject-prompt', runId, sessionId, prompt),
  setSessionPaused: (sessionId, paused) => ipcRenderer.invoke('execution:set-session-paused', sessionId, paused),
  sendSessionReply: (sessionId, text) => ipcRenderer.invoke('execution:send-session-reply', sessionId, text),
  importToInsight: sessionId => ipcRenderer.invoke('execution:import-to-insight', sessionId),
  insightStatus: () => ipcRenderer.invoke('execution:insight-status'),
  listProviders: () => ipcRenderer.invoke('execution:list-providers'),
  listSessionModels: runtime => ipcRenderer.invoke('execution:list-session-models', runtime),
  saveProviders: keys => ipcRenderer.invoke('execution:save-providers', keys),
  deleteProvider: providerIndex => ipcRenderer.invoke('execution:delete-provider', providerIndex),
  activateProvider: providerIndex => ipcRenderer.invoke('execution:activate-provider', providerIndex),
  testProvider: providerIndex => ipcRenderer.invoke('execution:test-provider', providerIndex),
  testProviderKey: (key, model, baseUrl, runtime) => ipcRenderer.invoke('execution:test-provider-key', key, model, baseUrl, runtime),
  subscribeRunEvents: (runId, listener) => {
    const handler = (_event: Electron.IpcRendererEvent, runEvent: RunEvent): void => {
      if (runEvent.runId === runId) listener(runEvent);
    };
    ipcRenderer.on('execution:event', handler);
    ipcRenderer.send('execution:subscribe-events', runId);
    return () => {
      ipcRenderer.removeListener('execution:event', handler);
      ipcRenderer.send('execution:unsubscribe-events', runId);
    };
  },
};
contextBridge.exposeInMainWorld('executionBackend', executionBackend);

contextBridge.exposeInMainWorld('insight', {
  show: (path: string, bounds: { x: number; y: number; width: number; height: number }, isDark: boolean): Promise<void> => ipcRenderer.invoke('insight:show', path, bounds, isDark),
  updateBounds: (bounds: { x: number; y: number; width: number; height: number }): Promise<void> => ipcRenderer.invoke('insight:update-bounds', bounds),
  hide: (): Promise<void> => ipcRenderer.invoke('insight:hide'),
  onLoadFailed: (listener: (description: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, description: string): void => listener(description);
    ipcRenderer.on('insight:load-failed', handler);
    return () => { ipcRenderer.removeListener('insight:load-failed', handler); };
  },
});
