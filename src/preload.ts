import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('workbench', {
  chooseWorkspace: (): Promise<string | undefined> => ipcRenderer.invoke('workspace:choose'),
  listMarkdownFiles: (): Promise<string[]> => ipcRenderer.invoke('workspace:list-markdown'),
  readFile: (fileName: string): Promise<string> => ipcRenderer.invoke('workspace:read-file', fileName),
  writeFile: (fileName: string, content: string): Promise<void> => ipcRenderer.invoke('workspace:write-file', fileName, content),
});
