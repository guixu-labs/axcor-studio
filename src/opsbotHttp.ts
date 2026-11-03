import path from 'node:path';
import type { CreateRunInput, Run } from './shared/protocol';
import {
  mapRun,
  OpsbotApiError,
  type OpsbotRunDetailResponse,
  type OpsbotRunListResponse,
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

export async function startOpsbotRun(input: CreateRunInput): Promise<Run> {
  if (!input.workspacePath) {
    throw new OpsbotApiError(422, '运行工作流需要先选择工作区');
  }
  const programPath = path.join(input.workspacePath, input.workflowId);
  const started = await opsbotRequest<OpsbotStartRunResponse>('POST', '/api/v1/runs', {
    program_path: programPath,
    work_dir: input.workspacePath,
    ...(input.workflowId ? { label: input.workflowId } : {}),
  });
  return getOpsbotRun(started.run_id);
}

export async function listOpsbotRuns(): Promise<Run[]> {
  const response = await opsbotRequest<OpsbotRunListResponse>('GET', '/api/v1/runs');
  return response.runs.map(mapRun);
}

export async function getOpsbotRun(runId: string): Promise<Run> {
  const response = await opsbotRequest<OpsbotRunDetailResponse>('GET', `/api/v1/runs/${encodeURIComponent(runId)}`);
  return mapRun(response.run);
}

export async function stopOpsbotRun(runId: string): Promise<Run> {
  await opsbotRequest<{ run_id: string; status: string; accepted: boolean }>('POST', `/api/v1/runs/${encodeURIComponent(runId)}/stop`);
  return getOpsbotRun(runId);
}
