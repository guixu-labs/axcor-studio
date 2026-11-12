export type StartupService = 'execution' | 'insight';
export type StartupPhase = 'checking' | 'starting' | 'ready' | 'failed';
export type StartupState = Record<StartupService, { phase: StartupPhase; detail?: string }>;

export function initialStartupState(): StartupState {
  return { execution: { phase: 'checking' }, insight: { phase: 'checking' } };
}

export interface StartupBridge {
  run(): Promise<StartupState>;
  onProgress(listener: (state: StartupState) => void): () => void;
  workbenchLoaded(error?: string): void;
  onWorkbenchFailed(listener: (message: string) => void): () => void;
}
