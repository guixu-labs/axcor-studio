import { contextBridge, ipcRenderer } from 'electron';
import type { CreateRunInput, Run, RunEvent } from './shared/protocol';

contextBridge.exposeInMainWorld('workbench', {
  chooseWorkspace: (): Promise<string | undefined> => ipcRenderer.invoke('workspace:choose'),
  listMarkdownFiles: (): Promise<string[]> => ipcRenderer.invoke('workspace:list-markdown'),
  readFile: (fileName: string): Promise<string> => ipcRenderer.invoke('workspace:read-file', fileName),
  writeFile: (fileName: string, content: string): Promise<void> => ipcRenderer.invoke('workspace:write-file', fileName, content),
});

contextBridge.exposeInMainWorld('opsbot', {
  setBaseUrl: (url: string): Promise<void> => ipcRenderer.invoke('opsbot:set-base-url', url),
  startRun: (input: CreateRunInput): Promise<Run> => ipcRenderer.invoke('opsbot:start-run', input),
  listRuns: (): Promise<Run[]> => ipcRenderer.invoke('opsbot:list-runs'),
  getRun: (runId: string): Promise<Run> => ipcRenderer.invoke('opsbot:get-run', runId),
  cancelRun: (runId: string): Promise<void> => ipcRenderer.invoke('opsbot:cancel-run', runId),
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
