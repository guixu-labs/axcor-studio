import type { RemoteWorkspaceConfig } from './workspace';

export type StartupService = 'execution' | 'insight';
export type StartupPhase = 'checking' | 'starting' | 'ready' | 'failed' | 'blocked';
export type StartupFailure = 'missing-command' | 'launch-error' | 'exited' | 'timeout' | 'unreachable' | 'occupied';
export type StartupState = Record<StartupService, { phase: StartupPhase; detail?: string; reason?: StartupFailure }>;
export type StartupChoice = { kind: 'local' } | { kind: 'ssh'; config: RemoteWorkspaceConfig };

export function initialStartupState(): StartupState {
  return { execution: { phase: 'checking' }, insight: { phase: 'checking' } };
}

export interface StartupBridge {
  chooseLocal(): Promise<string | undefined>;
  run(choice: StartupChoice, retry?: StartupService): Promise<StartupState>;
  onProgress(listener: (state: StartupState) => void): () => void;
  workbenchLoaded(error?: string): void;
  onWorkbenchFailed(listener: (message: string) => void): () => void;
}
