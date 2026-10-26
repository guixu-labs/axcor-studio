import type { Run } from './protocol';

export const isTerminalRun = (run: Run): boolean =>
  ['failed', 'completed', 'cancelled'].includes(run.status);
