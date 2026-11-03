import { contextBridge, ipcRenderer } from 'electron';
import type { CreateRunInput, Run, RunEvent } from './shared/protocol';
import type { InsightImportResult, InsightStatusResult, OpsbotSession } from './shared/opsbotApi';
import type { WorkspaceNode } from './workspaceFiles';

contextBridge.exposeInMainWorld('workbench', {
  chooseWorkspace: (): Promise<string | undefined> => ipcRenderer.invoke('workspace:choose'),
  getWorkspace: (): Promise<string | undefined> => ipcRenderer.invoke('workspace:get'),
  listTree: (): Promise<WorkspaceNode[]> => ipcRenderer.invoke('workspace:list-tree'),
  readFile: (filePath: string): Promise<string> => ipcRenderer.invoke('workspace:read-file', filePath),
  writeFile: (filePath: string, content: string): Promise<void> => ipcRenderer.invoke('workspace:write-file', filePath, content),
});

contextBridge.exposeInMainWorld('opsbot', {
  setBaseUrl: (url: string): Promise<void> => ipcRenderer.invoke('opsbot:set-base-url', url),
  getBaseUrl: (): Promise<string> => ipcRenderer.invoke('opsbot:get-base-url'),
  startRun: (input: CreateRunInput): Promise<Run> => ipcRenderer.invoke('opsbot:start-run', input),
  listRuns: (): Promise<Run[]> => ipcRenderer.invoke('opsbot:list-runs'),
  getRun: (runId: string): Promise<Run> => ipcRenderer.invoke('opsbot:get-run', runId),
  cancelRun: (runId: string): Promise<void> => ipcRenderer.invoke('opsbot:cancel-run', runId),
  getRunSessions: (runId: string): Promise<OpsbotSession[]> => ipcRenderer.invoke('opsbot:get-run-sessions', runId),
  injectPrompt: (runId: string, sessionId: string, prompt: string): Promise<void> => ipcRenderer.invoke('opsbot:inject-prompt', runId, sessionId, prompt),
  importToInsight: (sessionId: string): Promise<InsightImportResult> => ipcRenderer.invoke('opsbot:import-to-insight', sessionId),
  insightStatus: (): Promise<InsightStatusResult> => ipcRenderer.invoke('opsbot:insight-status'),
  subscribeRunEvents: (runId: string, listener: (event: RunEvent) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, runEvent: RunEvent): void => {
      if (runEvent.runId === runId) listener(runEvent);
    };
    ipcRenderer.on('opsbot:event', handler);
    ipcRenderer.send('opsbot:subscribe-events', runId);
    return () => {
      ipcRenderer.removeListener('opsbot:event', handler);
      ipcRenderer.send('opsbot:unsubscribe-events', runId);
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
