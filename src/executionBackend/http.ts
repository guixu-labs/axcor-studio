import path from 'node:path';
import { DEFAULT_EXECUTION_BACKEND_URL, EXECUTION_BACKEND_NAME } from '../shared/executionBackendConfig';
import type { CreateRunInput, Run } from '../shared/protocol';
import {
  mapRun,
  mapSession,
  ExecutionBackendApiError,
  type BackendRunDetailResponse,
  type BackendRunListResponse,
  type BackendSessionRecord,
  type BackendStartRunResponse,
} from './api';
import type {
  InsightImportResult,
  InsightStatusResult,
  ProviderKey,
  ProviderKeyInput,
  ProviderTestResult,
  ProviderValidation,
  SessionModelOption,
  RunSession,
} from '../shared/executionBackendIpc';

const DEFAULT_BASE_URL = process.env.EXECUTION_BACKEND_BASE_URL ?? DEFAULT_EXECUTION_BACKEND_URL;
const REQUEST_TIMEOUT_MS = 10_000;

let baseUrl = DEFAULT_BASE_URL;

export function setBackendBaseUrl(url: string): void {
  const trimmed = url.trim().replace(/\/+$/, '');
  baseUrl = trimmed || DEFAULT_BASE_URL;
}

export function getBackendBaseUrl(): string {
  return baseUrl;
}

export async function backendRequest<T>(method: 'GET' | 'POST' | 'DELETE', apiPath: string, body?: Record<string, unknown>): Promise<T> {
  const requestBaseUrl = baseUrl;
  let response: Response;
  try {
    response = await fetch(requestBaseUrl + apiPath, {
      method,
      headers: { 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new ExecutionBackendApiError(0, `无法连接 ${EXECUTION_BACKEND_NAME}（${requestBaseUrl}）：${error instanceof Error ? error.message : String(error)}`);
  }
  const text = await response.text();
  if (!response.ok) {
    if (response.status === 404 && method === 'GET' && apiPath === '/api/v1/runs') {
      throw new ExecutionBackendApiError(404, `地址 ${requestBaseUrl} 未提供 GET /api/v1/runs，请确认该端口运行的是 ${EXECUTION_BACKEND_NAME}。`);
    }
    let detail = text;
    try {
      const parsed = JSON.parse(text) as { detail?: string };
      detail = parsed.detail ?? text;
    } catch {
      // Non-JSON error body; keep the raw text.
    }
    throw new ExecutionBackendApiError(response.status, `${EXECUTION_BACKEND_NAME} API 错误（${response.status}）：${detail}`);
  }
  return JSON.parse(text) as T;
}

// Tracks which run ids were created as sessions so list/get/stop/events
// dispatch to the session API instead of the run API.
const sessionRunIds = new Set<string>();

export function isSessionRun(runId: string): boolean {
  return sessionRunIds.has(runId);
}

export async function startWorkflowRun(input: CreateRunInput): Promise<Run> {
  if (!input.workspacePath) {
    throw new ExecutionBackendApiError(422, '运行工作流需要先选择工作区');
  }
  const programPath = path.join(input.workspacePath, input.workflowId);
  const body: Record<string, unknown> = {
    program_path: programPath,
    work_dir: input.workspacePath,
  };
  if (input.label) body.label = input.label;
  if (input.params && Object.keys(input.params).length > 0) body.params = input.params;
  if (input.maxParallel !== undefined) body.max_parallel = input.maxParallel;
  const started = await backendRequest<BackendStartRunResponse>('POST', '/api/v1/runs', body);
  return getRun(started.run_id);
}

export async function startSessionRun(input: CreateRunInput): Promise<Run> {
  if (!input.workspacePath) {
    throw new ExecutionBackendApiError(422, '启动会话需要先选择工作区');
  }
  const prompt = input.prompt?.trim();
  if (!prompt) {
    throw new ExecutionBackendApiError(422, '会话模式需要填写提示词');
  }
  const body: Record<string, unknown> = {
    project_dir: input.workspacePath,
    prompt,
  };
  if (input.sessionRuntime) body.runtime = input.sessionRuntime;
  if (input.model?.trim()) body.model = input.model.trim();
  if (input.providerIndex !== undefined) body.provider_index = input.providerIndex;
  if (input.systemPrompt?.trim()) body.system_prompt = input.systemPrompt.trim();
  if (input.maxIterations !== undefined) body.max_iterations = input.maxIterations;
  if (input.reviewerEnabled !== undefined) body.reviewer_enabled = input.reviewerEnabled;
  const started = await backendRequest<{ session_id: string }>('POST', '/api/v1/sessions/start', body);
  sessionRunIds.add(started.session_id);
  return getRun(started.session_id);
}

export async function listRuns(): Promise<Run[]> {
  const [runsResponse, sessions] = await Promise.all([
    backendRequest<BackendRunListResponse>('GET', '/api/v1/runs'),
    backendRequest<BackendSessionRecord[]>('GET', '/api/v1/sessions'),
  ]);
  for (const session of sessions) sessionRunIds.add(session.id);
  return [...runsResponse.runs.map(mapRun), ...sessions.map(mapSession)];
}

export async function getRun(runId: string): Promise<Run> {
  if (sessionRunIds.has(runId)) {
    const session = await backendRequest<BackendSessionRecord>('GET', `/api/v1/sessions/${encodeURIComponent(runId)}`);
    return mapSession(session);
  }
  try {
    const response = await backendRequest<BackendRunDetailResponse>('GET', `/api/v1/runs/${encodeURIComponent(runId)}`);
    return mapRun(response.run);
  } catch (error) {
    if (error instanceof ExecutionBackendApiError && error.status === 404) {
      const session = await backendRequest<BackendSessionRecord>('GET', `/api/v1/sessions/${encodeURIComponent(runId)}`);
      sessionRunIds.add(runId);
      return mapSession(session);
    }
    throw error;
  }
}

export async function stopRun(runId: string): Promise<Run> {
  if (sessionRunIds.has(runId)) {
    await backendRequest<Record<string, unknown>>('POST', `/api/v1/sessions/${encodeURIComponent(runId)}/stop`);
    return getRun(runId);
  }
  await backendRequest<{ run_id: string; status: string; accepted: boolean }>('POST', `/api/v1/runs/${encodeURIComponent(runId)}/stop`);
  return getRun(runId);
}

export async function getRunSessions(runId: string): Promise<RunSession[]> {
  const response = await backendRequest<BackendRunDetailResponse>('GET', `/api/v1/runs/${encodeURIComponent(runId)}`);
  return response.sessions;
}

export async function injectSessionPrompt(runId: string, sessionId: string, prompt: string): Promise<void> {
  await backendRequest<{ run_id: string; session_id: string; accepted: boolean }>(
    'POST',
    `/api/v1/runs/${encodeURIComponent(runId)}/sessions/${encodeURIComponent(sessionId)}/inject`,
    { prompt },
  );
}

export async function importSessionToInsight(sessionId: string): Promise<InsightImportResult> {
  const result = await backendRequest<InsightImportResult>('POST', `/api/v1/insight/import?session_id=${encodeURIComponent(sessionId)}`);
  return result.ok ? result : { ...result, ok: false };
}

export async function getInsightStatus(): Promise<InsightStatusResult> {
  return backendRequest<InsightStatusResult>('GET', '/api/v1/insight/status');
}

export async function listProviders(): Promise<ProviderKey[]> {
  const result = await backendRequest<{ keys?: ProviderKey[] }>('GET', '/api/v1/auth/keys');
  return result.keys ?? [];
}

export async function listSessionModels(runtime: string): Promise<SessionModelOption[]> {
  const result = await backendRequest<{ providers?: Array<{
    index: number;
    runtime?: string;
    model?: string;
    status: string;
    is_active?: boolean;
    worker_validation?: ProviderValidation;
  }> }>('GET', '/api/v1/auth/status');
  const models = new Map<string, SessionModelOption>();
  for (const provider of result.providers ?? []) {
    const model = provider.model?.trim();
    if (provider.runtime !== runtime || !model) continue;
    if (provider.status !== 'unused' && provider.status !== 'active') continue;
    if (provider.worker_validation?.status === 'invalid' || provider.worker_validation?.success === false) continue;
    if (!models.has(model) || provider.is_active) models.set(model, { model, providerIndex: provider.index });
  }
  return [...models.values()];
}

export async function saveProviders(keys: ProviderKeyInput[]): Promise<{ ok: boolean; error?: string }> {
  const result = await backendRequest<{ ok?: boolean; error?: string }>('POST', '/api/v1/auth/keys', { keys });
  return { ok: result.ok === true, error: result.error };
}

export async function deleteProvider(providerIndex: number): Promise<void> {
  await backendRequest<{ ok: boolean }>('DELETE', `/api/v1/auth/keys/${providerIndex}`);
}

export async function activateProvider(providerIndex: number): Promise<{ ok: boolean; activeIndex?: number }> {
  const result = await backendRequest<{ ok?: boolean; active_index?: number }>('POST', '/api/v1/auth/activate', { index: providerIndex });
  return { ok: result.ok === true, activeIndex: result.active_index };
}

export async function testProvider(providerIndex: number): Promise<ProviderTestResult> {
  return backendRequest<ProviderTestResult>('POST', `/api/v1/auth/keys/${providerIndex}/test`);
}

export async function testProviderKey(key: string, model: string, baseUrl: string, runtime?: string): Promise<ProviderTestResult> {
  return backendRequest<ProviderTestResult>('POST', '/api/v1/auth/test-key', { key, model, base_url: baseUrl, ...(runtime ? { runtime } : {}) });
}
