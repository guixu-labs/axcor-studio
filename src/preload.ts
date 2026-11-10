import { contextBridge, ipcRenderer } from 'electron';
import type { CreateRunInput, Run, RunEvent } from './shared/protocol';
import type { InsightImportResult, InsightStatusResult, BackendSession, ProviderKey, ProviderKeyInput, ProviderTestResult } from './shared/executionBackendApi';
import type { WorkspaceNode } from './workspaceFiles';

contextBridge.exposeInMainWorld('workbench', {
  chooseWorkspace: (): Promise<string | undefined> => ipcRenderer.invoke('workspace:choose'),
  getWorkspace: (): Promise<string | undefined> => ipcRenderer.invoke('workspace:get'),
  listTree: (): Promise<WorkspaceNode[]> => ipcRenderer.invoke('workspace:list-tree'),
  readFile: (filePath: string): Promise<string> => ipcRenderer.invoke('workspace:read-file', filePath),
  writeFile: (filePath: string, content: string): Promise<void> => ipcRenderer.invoke('workspace:write-file', filePath, content),
});

contextBridge.exposeInMainWorld('executionBackend', {
  setBaseUrl: (url: string): Promise<void> => ipcRenderer.invoke('execution:set-base-url', url),
  getBaseUrl: (): Promise<string> => ipcRenderer.invoke('execution:get-base-url'),
  startRun: (input: CreateRunInput): Promise<Run> => ipcRenderer.invoke('execution:start-run', input),
  listRuns: (): Promise<Run[]> => ipcRenderer.invoke('execution:list-runs'),
  getRun: (runId: string): Promise<Run> => ipcRenderer.invoke('execution:get-run', runId),
  cancelRun: (runId: string): Promise<void> => ipcRenderer.invoke('execution:cancel-run', runId),
  getRunSessions: (runId: string): Promise<BackendSession[]> => ipcRenderer.invoke('execution:get-run-sessions', runId),
  injectPrompt: (runId: string, sessionId: string, prompt: string): Promise<void> => ipcRenderer.invoke('execution:inject-prompt', runId, sessionId, prompt),
  importToInsight: (sessionId: string): Promise<InsightImportResult> => ipcRenderer.invoke('execution:import-to-insight', sessionId),
  insightStatus: (): Promise<InsightStatusResult> => ipcRenderer.invoke('execution:insight-status'),
  listProviders: (): Promise<ProviderKey[]> => ipcRenderer.invoke('execution:list-providers'),
  saveProviders: (keys: ProviderKeyInput[]): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke('execution:save-providers', keys),
  deleteProvider: (providerIndex: number): Promise<void> => ipcRenderer.invoke('execution:delete-provider', providerIndex),
  activateProvider: (providerIndex: number): Promise<{ ok: boolean; activeIndex?: number }> => ipcRenderer.invoke('execution:activate-provider', providerIndex),
  testProvider: (providerIndex: number): Promise<ProviderTestResult> => ipcRenderer.invoke('execution:test-provider', providerIndex),
  testProviderKey: (key: string, model: string, baseUrl: string, runtime?: string): Promise<ProviderTestResult> => ipcRenderer.invoke('execution:test-provider-key', key, model, baseUrl, runtime),
  subscribeRunEvents: (runId: string, listener: (event: RunEvent) => void): (() => void) => {
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
});

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
