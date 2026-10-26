declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

interface Window {
  workbench: {
    chooseWorkspace(): Promise<string | undefined>;
    listMarkdownFiles(): Promise<string[]>;
    readFile(fileName: string): Promise<string>;
    writeFile(fileName: string, content: string): Promise<void>;
  };
}
