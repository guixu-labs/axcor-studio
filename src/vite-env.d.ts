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
  opsbot: {
    setBaseUrl(url: string): Promise<void>;
    getBaseUrl(): Promise<string>;
    startRun(input: import('./shared/protocol').CreateRunInput): Promise<import('./shared/protocol').Run>;
    listRuns(): Promise<import('./shared/protocol').Run[]>;
    getRun(runId: string): Promise<import('./shared/protocol').Run>;
    cancelRun(runId: string): Promise<void>;
    getRunSessions(runId: string): Promise<import('./shared/opsbotApi').OpsbotSession[]>;
    importToInsight(sessionId: string): Promise<import('./shared/opsbotApi').InsightImportResult>;
    insightStatus(): Promise<import('./shared/opsbotApi').InsightStatusResult>;
    subscribeRunEvents(runId: string, listener: (event: import('./shared/protocol').RunEvent) => void): () => void;
  };
  insight: {
    show(path: string, bounds: { x: number; y: number; width: number; height: number }, isDark: boolean): Promise<void>;
    updateBounds(bounds: { x: number; y: number; width: number; height: number }): Promise<void>;
    hide(): Promise<void>;
    onLoadFailed(listener: (description: string) => void): () => void;
  };
}
