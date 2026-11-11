import { BrowserWindow, ipcMain } from 'electron';
import { getBackendBaseUrl, setBackendBaseUrl } from './executionBackend/http';
import { ensureExecutionBackendRunning } from './executionBackend/lifecycle';
import { ensureInsightRunning } from './observability/insightService';
import { initialStartupState, type StartupService, type StartupState } from './shared/startup';

let state = initialStartupState();
let inFlight: Promise<StartupState> | undefined;

function publish(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.webContents.isDestroyed()) window.webContents.send('startup:progress', state);
  }
}

async function checkService(service: StartupService, check: (onStarting: () => void) => Promise<void>): Promise<void> {
  try {
    await check(() => {
      state[service] = { phase: 'starting' };
      publish();
    });
    state[service] = { phase: 'ready' };
  } catch (error) {
    state[service] = { phase: 'failed', detail: error instanceof Error ? error.message : String(error) };
  }
  publish();
}

export function registerStartupIpc(onState: (sender: Electron.WebContents, state: StartupState) => void): void {
  ipcMain.handle('startup:run', async ({ sender }, executionUrl: string) => {
    if (inFlight) {
      publish();
    } else {
      setBackendBaseUrl(executionUrl);
      state = initialStartupState();
      onState(sender, state);
      publish();
      inFlight = Promise.all([
        checkService('execution', async onStarting => {
          if (!await ensureExecutionBackendRunning(onStarting)) {
            throw new Error(`workflow-controller · ${getBackendBaseUrl()}`);
          }
        }),
        checkService('insight', ensureInsightRunning),
      ]).then(() => state).finally(() => { inFlight = undefined; });
    }
    const result = await inFlight;
    if (!sender.isDestroyed()) onState(sender, result);
    return result;
  });
}
