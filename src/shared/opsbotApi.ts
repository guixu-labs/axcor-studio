import type { Run, RunEvent, RunStatus } from './protocol';

// Wire shapes of the Opsbot public API v1 (runs). The source of truth is
// opsbot's src/opsbot/web/routes/runs_routes.py and api/run_api.py
// (baseline: feat/reasoning-0day-adaptation). This module only declares
// what the workbench consumes and maps it onto the shared protocol.

export type OpsbotRunStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'stopped';

export interface OpsbotRun {
  run_id: string;
  kind: string;
  format: string;
  status: OpsbotRunStatus;
  program_ref: string;
  params: Record<string, string>;
  label: string | null;
  work_dir: string | null;
  max_parallel: number | null;
  pause_reason: string | null;
  created_at: string;
  finished_at: string | null;
  reopened_at: string | null;
  error: string | null;
  member_count: number;
  running_count: number;
}

export interface OpsbotRunListResponse {
  runs: OpsbotRun[];
}

export interface OpsbotRunDetailResponse {
  run: OpsbotRun;
  sessions: unknown[];
}

export interface OpsbotStartRunResponse {
  run_id: string;
  status: OpsbotRunStatus;
  format: string;
  kind: string;
}

export interface OpsbotEventPage {
  events: OpsbotEvent[];
  next_cursor: string;
  limit: number;
}

export interface OpsbotEvent {
  id: number;
  run_id: string;
  session_id?: string | null;
  iteration?: number | null;
  timestamp: string;
  event_type: string;
  data: unknown;
  source: 'run_events' | 'events';
}

const RUN_STATUS_MAP: Record<OpsbotRunStatus, RunStatus> = {
  pending: 'queued',
  running: 'running',
  paused: 'paused',
  completed: 'completed',
  failed: 'failed',
  stopped: 'cancelled',
};

export function mapRunStatus(status: string): RunStatus {
  return RUN_STATUS_MAP[status as OpsbotRunStatus] ?? 'queued';
}

export function mapRun(record: OpsbotRun): Run {
  return {
    id: record.run_id,
    workflowId: record.label || record.program_ref || record.run_id,
    status: mapRunStatus(record.status),
    createdAt: record.created_at,
    updatedAt: record.finished_at ?? record.reopened_at ?? record.created_at,
  };
}

export function mapEvent(raw: OpsbotEvent): RunEvent {
  return {
    id: String(raw.id),
    runId: raw.run_id,
    type: raw.event_type,
    timestamp: raw.timestamp,
    ...(raw.session_id ? { stepId: raw.session_id } : {}),
    payload: parseEventData(raw.data),
  };
}

function parseEventData(data: unknown): unknown {
  if (typeof data !== 'string') return data;
  try {
    return JSON.parse(data) as unknown;
  } catch {
    return data;
  }
}

export class OpsbotApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'OpsbotApiError';
    this.status = status;
  }
}
