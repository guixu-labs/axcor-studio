import type { Run, RunEvent, RunStatus } from './protocol';

// API v1 wire types consumed by the workbench and their mappings to the shared protocol.

export type BackendRunStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'stopped';

export interface BackendRun {
  run_id: string;
  kind: string;
  format: string;
  status: BackendRunStatus;
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

export interface BackendRunListResponse {
  runs: BackendRun[];
}

export interface BackendRunDetailResponse {
  run: BackendRun;
  sessions: BackendSession[];
}

export interface BackendSession {
  session_id: string;
  role: string;
  context: string | null;
  state: string;
  stop_reason: string | null;
  in_flight: boolean;
}

export interface InsightImportResult {
  ok: boolean;
  sessionId?: string;
  insightUrl?: string;
  imported?: boolean;
  error?: string;
}

export interface InsightStatusResult {
  running: boolean;
  port: number;
}

export interface ProviderValidation {
  success?: boolean;
  error?: string;
  [key: string]: unknown;
}

export interface SessionModelOption {
  model: string;
  providerIndex: number;
}

export interface ProviderKey {
  key: string;
  masked: string;
  provider_index: number;
  model?: string;
  base_url?: string;
  runtime?: string;
  provider_kind?: string;
  worker_validation?: ProviderValidation;
  reviewer_validation?: ProviderValidation;
}

export interface ProviderKeyInput {
  key: string;
  model?: string;
  base_url?: string;
  runtime?: string;
}

export interface ProviderTestResult {
  success?: boolean;
  error?: string;
  [key: string]: unknown;
}

export interface BackendStartRunResponse {
  run_id: string;
  status: BackendRunStatus;
  format: string;
  kind: string;
}

export interface BackendEventPage {
  events: BackendEvent[];
  next_cursor: string;
  limit: number;
}

export interface BackendEvent {
  id: number;
  run_id: string;
  session_id?: string | null;
  iteration?: number | null;
  timestamp: string;
  event_type: string;
  data: unknown;
  source: 'run_events' | 'events';
}

const RUN_STATUS_MAP: Record<BackendRunStatus, RunStatus> = {
  pending: 'queued',
  running: 'running',
  paused: 'paused',
  completed: 'completed',
  failed: 'failed',
  stopped: 'cancelled',
};

export function mapRunStatus(status: string): RunStatus {
  return RUN_STATUS_MAP[status as BackendRunStatus] ?? 'queued';
}

export function mapRun(record: BackendRun): Run {
  return {
    id: record.run_id,
    workflowId: record.label || record.program_ref || record.run_id,
    status: mapRunStatus(record.status),
    createdAt: record.created_at,
    updatedAt: record.finished_at ?? record.reopened_at ?? record.created_at,
    runtimeId: 'workflow',
    memberCount: record.member_count,
    runningCount: record.running_count,
  };
}

export interface BackendSessionRecord {
  id: string;
  name?: string | null;
  role?: string | null;
  state?: string;
  created_at?: string | null;
  created_at_iso?: string | null;
  stop_reason?: string | null;
  loop_status?: string | null;
  model?: string | null;
  current_iteration?: number;
  max_iterations?: number;
  elapsed_seconds?: number;
  context_window?: number | null;
}

export interface BackendSessionEventPage {
  cursor: string;
  events: Array<Pick<BackendEvent, 'timestamp' | 'event_type' | 'data' | 'iteration'>>;
}

const SESSION_STATUS_MAP: Record<string, RunStatus> = {
  creating: 'queued',
  idle: 'queued',
  waiting_retry: 'queued',
  running: 'running',
  paused: 'paused',
  completed: 'completed',
  failed: 'failed',
  stopped: 'cancelled',
};

export function mapSession(session: BackendSessionRecord): Run {
  const createdAt = session.created_at_iso || session.created_at || '';
  const status = session.state === 'idle' && session.stop_reason === 'max_iterations'
    ? 'completed' : SESSION_STATUS_MAP[session.state ?? ''] ?? 'queued';
  return {
    id: session.id,
    workflowId: session.name || session.id,
    status,
    createdAt,
    updatedAt: createdAt,
    runtimeId: 'session',
    model: session.model || undefined,
    iteration: session.current_iteration,
    maxIterations: session.max_iterations,
    elapsedSeconds: session.elapsed_seconds,
    contextWindow: session.context_window ?? undefined,
  };
}

export function mapEvent(raw: BackendEvent): RunEvent {
  return {
    id: String(raw.id),
    runId: raw.run_id,
    type: raw.event_type,
    timestamp: raw.timestamp,
    ...(raw.session_id ? { stepId: raw.session_id } : {}),
    source: raw.source,
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

export class ExecutionBackendApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ExecutionBackendApiError';
    this.status = status;
  }
}
