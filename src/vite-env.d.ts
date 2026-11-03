declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

interface Window {
  workbench: {
    chooseWorkspace(): Promise<string | undefined>;
    listMarkdownFiles(): Promise<string[]>;
    readFile(fileName: string): Promise<string>;
    writeFile(fileName: string, content: string): Promise<void>;
  };
  opsbot: {
    setBaseUrl(url: string): Promise<void>;
    startRun(input: import('./shared/protocol').CreateRunInput): Promise<import('./shared/protocol').Run>;
    listRuns(): Promise<import('./shared/protocol').Run[]>;
    getRun(runId: string): Promise<import('./shared/protocol').Run>;
    cancelRun(runId: string): Promise<void>;
    subscribeRunEvents(runId: string, listener: (event: import('./shared/protocol').RunEvent) => void): () => void;
  };
}
