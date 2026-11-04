import path from 'node:path';
import type { CreateRunInput, Run } from './shared/protocol';
import {
  mapRun,
  mapSession,
  OpsbotApiError,
  type InsightImportResult,
  type InsightStatusResult,
  type OpsbotRunDetailResponse,
  type OpsbotRunListResponse,
  type OpsbotSession,
  type OpsbotSessionRecord,
  type OpsbotStartRunResponse,
} from './shared/opsbotApi';

const DEFAULT_BASE_URL = process.env.OPSBOT_BASE_URL ?? 'http://127.0.0.1:18600';
const REQUEST_TIMEOUT_MS = 10_000;

let baseUrl = DEFAULT_BASE_URL;

export function setOpsbotBaseUrl(url: string): void {
  const trimmed = url.trim().replace(/\/+$/, '');
  baseUrl = trimmed || DEFAULT_BASE_URL;
}

export function getOpsbotBaseUrl(): string {
  return baseUrl;
}

export async function opsbotRequest<T>(method: 'GET' | 'POST', apiPath: string, body?: Record<string, unknown>): Promise<T> {
  let response: Response;
  try {
    response = await fetch(baseUrl + apiPath, {
      method,
      headers: { 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new OpsbotApiError(0, `无法连接 Opsbot（${baseUrl}）：${error instanceof Error ? error.message : String(error)}`);
  }
  const text = await response.text();
  if (!response.ok) {
    let detail = text;
    try {
      const parsed = JSON.parse(text) as { detail?: string };
      detail = parsed.detail ?? text;
    } catch {
      // Non-JSON error body; keep the raw text.
    }
    throw new OpsbotApiError(response.status, `Opsbot API 错误（${response.status}）：${detail}`);
  }
  return JSON.parse(text) as T;
}

// Tracks which run ids were created as sessions so list/get/stop/events
// dispatch to the session API instead of the run API.
const sessionRunIds = new Set<string>();

export function isSessionRun(runId: string): boolean {
  return sessionRunIds.has(runId);
}

export async function startOpsbotRun(input: CreateRunInput): Promise<Run> {
  if (!input.workspacePath) {
    throw new OpsbotApiError(422, '运行工作流需要先选择工作区');
  }
  const programPath = path.join(input.workspacePath, input.workflowId);
  const body: Record<string, unknown> = {
    program_path: programPath,
    work_dir: input.workspacePath,
  };
  if (input.label) body.label = input.label;
  if (input.params && Object.keys(input.params).length > 0) body.params = input.params;
  if (input.maxParallel !== undefined) body.max_parallel = input.maxParallel;
  const started = await opsbotRequest<OpsbotStartRunResponse>('POST', '/api/v1/runs', body);
  return getOpsbotRun(started.run_id);
}

export async function startOpsbotSession(input: CreateRunInput): Promise<Run> {
  if (!input.workspacePath) {
    throw new OpsbotApiError(422, '启动会话需要先选择工作区');
  }
  const prompt = input.prompt?.trim();
  if (!prompt) {
    throw new OpsbotApiError(422, '会话模式需要填写提示词');
  }
  const body: Record<string, unknown> = {
    project_dir: input.workspacePath,
    prompt,
  };
  if (input.sessionRuntime) body.runtime = input.sessionRuntime;
  if (input.model?.trim()) body.model = input.model.trim();
  if (input.systemPrompt?.trim()) body.system_prompt = input.systemPrompt.trim();
  if (input.maxIterations !== undefined) body.max_iterations = input.maxIterations;
  if (input.reviewerEnabled !== undefined) body.reviewer_enabled = input.reviewerEnabled;
  const started = await opsbotRequest<{ session_id: string }>('POST', '/api/v1/sessions/start', body);
  sessionRunIds.add(started.session_id);
  return getOpsbotRun(started.session_id);
}

export async function listOpsbotRuns(): Promise<Run[]> {
  const [runsResponse, sessions] = await Promise.all([
    opsbotRequest<OpsbotRunListResponse>('GET', '/api/v1/runs'),
    opsbotRequest<OpsbotSessionRecord[]>('GET', '/api/v1/sessions'),
  ]);
  for (const session of sessions) sessionRunIds.add(session.id);
  return [...runsResponse.runs.map(mapRun), ...sessions.map(mapSession)];
}

export async function getOpsbotRun(runId: string): Promise<Run> {
  if (sessionRunIds.has(runId)) {
    const session = await opsbotRequest<OpsbotSessionRecord>('GET', `/api/v1/sessions/${encodeURIComponent(runId)}`);
    return mapSession(session);
  }
  try {
    const response = await opsbotRequest<OpsbotRunDetailResponse>('GET', `/api/v1/runs/${encodeURIComponent(runId)}`);
    return mapRun(response.run);
  } catch (error) {
    if (error instanceof OpsbotApiError && error.status === 404) {
      const session = await opsbotRequest<OpsbotSessionRecord>('GET', `/api/v1/sessions/${encodeURIComponent(runId)}`);
      sessionRunIds.add(runId);
      return mapSession(session);
    }
    throw error;
  }
}

export async function stopOpsbotRun(runId: string): Promise<Run> {
  if (sessionRunIds.has(runId)) {
    await opsbotRequest<Record<string, unknown>>('POST', `/api/v1/sessions/${encodeURIComponent(runId)}/stop`);
    return getOpsbotRun(runId);
  }
  await opsbotRequest<{ run_id: string; status: string; accepted: boolean }>('POST', `/api/v1/runs/${encodeURIComponent(runId)}/stop`);
  return getOpsbotRun(runId);
}

export async function getOpsbotRunSessions(runId: string): Promise<OpsbotSession[]> {
  const response = await opsbotRequest<OpsbotRunDetailResponse>('GET', `/api/v1/runs/${encodeURIComponent(runId)}`);
  return response.sessions;
}

export async function injectOpsbotSessionPrompt(runId: string, sessionId: string, prompt: string): Promise<void> {
  await opsbotRequest<{ run_id: string; session_id: string; accepted: boolean }>(
    'POST',
    `/api/v1/runs/${encodeURIComponent(runId)}/sessions/${encodeURIComponent(sessionId)}/inject`,
    { prompt },
  );
}

export async function importOpsbotSessionToInsight(sessionId: string): Promise<InsightImportResult> {
  const result = await opsbotRequest<InsightImportResult>('POST', `/api/v1/insight/import?session_id=${encodeURIComponent(sessionId)}`);
  return result.ok ? result : { ...result, ok: false };
}

export async function getInsightStatus(): Promise<InsightStatusResult> {
  return opsbotRequest<InsightStatusResult>('GET', '/api/v1/insight/status');
}
