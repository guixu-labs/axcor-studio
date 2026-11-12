/// <reference types="vite/client" />

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

interface Window {
  startup: import('./shared/startup').StartupBridge;
  workbench: import('./shared/workspace').WorkspaceBridge;
  executionBackend: import('./shared/executionBackendIpc').ExecutionBackendBridge;
  insight: {
    show(path: string, bounds: { x: number; y: number; width: number; height: number }, isDark: boolean): Promise<void>;
    updateBounds(bounds: { x: number; y: number; width: number; height: number }): Promise<void>;
    hide(): Promise<void>;
    onLoadFailed(listener: (description: string) => void): () => void;
  };
}
