import type { Run, RunEvent } from './protocol';

export const isTerminalRun = (run: Run): boolean =>
  ['failed', 'completed', 'cancelled'].includes(run.status);

export const runEventKey = (event: RunEvent): string => `${event.source ?? ''}:${event.id}`;

const subagentTools = new Set(['agent', 'task', 'spawn_agent']);

export const isSubagentTool = (name: unknown): boolean =>
  typeof name === 'string' && subagentTools.has(name.toLowerCase());

export function eventPayloadRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
}

export function toolArgumentRecord(input: unknown, argument: unknown): Record<string, unknown> | undefined {
  const fields = eventPayloadRecord(input) ?? eventPayloadRecord(argument);
  if (fields) return fields;
  const serialized = typeof input === 'string' ? input : argument;
  if (typeof serialized !== 'string' || !serialized.trimStart().startsWith('{')) return undefined;
  try { return eventPayloadRecord(JSON.parse(serialized)); } catch { return undefined; }
}
