import { ipcMain, type WebContents } from 'electron';
import { DEFAULT_EXECUTION_BACKEND_URL } from './shared/executionBackendConfig';
import { ensureExecutionBackendRunning } from './executionBackend/lifecycle';
import { ensureInsightRunning } from './observability/insightService';
import { initialStartupState, type StartupChoice, type StartupService, type StartupState } from './shared/startup';
import { ServiceStartupError } from './serviceStartupError';
import type { WorkspaceManager } from './workspaceManager';

export function registerStartupIpc(
  workspaces: WorkspaceManager,
  isStartup: (sender: WebContents) => boolean,
  onState: (sender: WebContents, state: StartupState) => void,
): void {
  let running = false;
  let previous: { sender: WebContents; choice: StartupChoice; state: StartupState } | undefined;
  const guard = (event: Electron.IpcMainInvokeEvent): void => {
    if (!isStartup(event.sender) || event.senderFrame !== event.sender.mainFrame || running) {
      throw new Error('Invalid startup request.');
    }
  };
  ipcMain.handle('startup:choose-local', async event => {
    guard(event);
    running = true;
    try { return (await workspaces.choose())?.root; }
    finally { running = false; }
  });
  ipcMain.handle('startup:run', async (event, selected: StartupChoice, retry?: StartupService) => {
    guard(event);
    const { sender } = event;
    const prior = previous?.sender === sender ? previous : undefined;
    if (retry && prior?.state[retry]?.phase !== 'failed') throw new Error('This service is not awaiting retry.');
    const choice = retry && prior ? prior.choice : selected;
    const state = retry && prior ? { ...prior.state, [retry]: { phase: 'checking' as const } } : initialStartupState();
    previous = { sender, choice, state };
    running = true;
    const publish = (): void => {
      if (sender.isDestroyed()) return;
      sender.send('startup:progress', state);
      onState(sender, state);
    };
    const check = async (service: StartupService, start: (onStarting: () => void) => Promise<void>): Promise<void> => {
      try {
        await start(() => {
          state[service] = { phase: 'starting' };
          publish();
        });
        state[service] = { phase: 'ready' };
      } catch (error) {
        state[service] = {
          phase: 'failed',
          detail: error instanceof ServiceStartupError ? error.detail : error instanceof Error ? error.message : String(error),
          reason: error instanceof ServiceStartupError ? error.reason : undefined,
        };
      }
      publish();
    };
    publish();
    try {
      if (choice.kind === 'ssh') {
        const workspace = workspaces.workspace;
        if (retry !== 'insight' || workspace?.kind !== 'ssh' || !workspace.connected) {
          await check('execution', async onStarting => { await workspaces.connect(choice.config, onStarting); });
        }
        if (state.execution.phase === 'ready') {
          await check('insight', onStarting => workspaces.insightTarget().ensureReady(onStarting));
        } else {
          state.insight = { phase: 'blocked' };
          publish();
        }
      } else if (choice.kind === 'local' && workspaces.workspace?.kind === 'local') {
        await Promise.all([
          retry === 'insight' ? undefined : check('execution', async onStarting => {
            if (!await ensureExecutionBackendRunning(onStarting)) {
              throw new ServiceStartupError('unreachable', DEFAULT_EXECUTION_BACKEND_URL);
            }
          }),
          retry === 'execution' ? undefined : check('insight', ensureInsightRunning),
        ]);
      } else {
        throw new Error('Choose a workspace before starting the workbench.');
      }
      return state;
    } finally {
      running = false;
    }
  });
}
