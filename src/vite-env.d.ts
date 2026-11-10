/// <reference types="vite/client" />

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

interface Window {
  workbench: {
    chooseWorkspace(): Promise<string | undefined>;
    getWorkspace(): Promise<string | undefined>;
    listTree(): Promise<import('./workspaceFiles').WorkspaceNode[]>;
    readFile(filePath: string): Promise<string>;
    writeFile(filePath: string, content: string): Promise<void>;
  };
  executionBackend: import('./shared/executionBackendIpc').ExecutionBackendBridge;
  insight: {
    show(path: string, bounds: { x: number; y: number; width: number; height: number }, isDark: boolean): Promise<void>;
    updateBounds(bounds: { x: number; y: number; width: number; height: number }): Promise<void>;
    hide(): Promise<void>;
    onLoadFailed(listener: (description: string) => void): () => void;
  };
}
