import type { StartupFailure } from './shared/startup';

export class ServiceStartupError extends Error {
  constructor(
    readonly reason: StartupFailure,
    readonly detail: string,
  ) {
    super([reason.replaceAll('-', ' '), detail].filter(Boolean).join(' · '));
    this.name = 'ServiceStartupError';
  }
}

export function serviceSpawnError(command: string, error: NodeJS.ErrnoException): ServiceStartupError {
  return error.code === 'ENOENT'
    ? new ServiceStartupError('missing-command', command)
    : new ServiceStartupError('launch-error', error.message);
}

export function serviceExitError(
  code: number | null,
  signal: NodeJS.Signals | null,
  stderr: string,
): ServiceStartupError {
  const detail = stderr
    .trim()
    .split(/\r?\n/)
    .filter(line => line.trim())
    .at(-1);
  const status = signal ?? (code === null ? '' : 'exit ' + code);
  return new ServiceStartupError('exited', [status, detail].filter(Boolean).join(' · '));
}
