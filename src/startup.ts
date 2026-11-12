import { BrowserWindow, ipcMain } from 'electron';
import { DEFAULT_EXECUTION_BACKEND_URL, EXECUTION_BACKEND_COMMAND } from './shared/executionBackendConfig';
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

export function registerStartupIpc(
  isStartupWindow: (sender: Electron.WebContents) => boolean,
  onState: (sender: Electron.WebContents, state: StartupState) => void,
): void {
  ipcMain.handle('startup:run', async ({ sender }) => {
    if (!isStartupWindow(sender)) throw new Error('Invalid startup caller');
    if (inFlight) {
      publish();
    } else {
      state = initialStartupState();
      onState(sender, state);
      publish();
      inFlight = Promise.all([
        checkService('execution', async onStarting => {
          if (!await ensureExecutionBackendRunning(onStarting)) {
            throw new Error(`${EXECUTION_BACKEND_COMMAND} · ${DEFAULT_EXECUTION_BACKEND_URL}`);
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
