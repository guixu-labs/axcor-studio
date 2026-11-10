import type { CreateRunInput, Run, RunEvent } from './protocol';

export interface RunSession {
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

export interface ExecutionBackendBridge {
  setBaseUrl(url: string): Promise<void>;
  getBaseUrl(): Promise<string>;
  startRun(input: CreateRunInput): Promise<Run>;
  listRuns(): Promise<Run[]>;
  getRun(runId: string): Promise<Run>;
  cancelRun(runId: string): Promise<void>;
  getRunSessions(runId: string): Promise<RunSession[]>;
  injectPrompt(runId: string, sessionId: string, prompt: string): Promise<void>;
  importToInsight(sessionId: string): Promise<InsightImportResult>;
  insightStatus(): Promise<InsightStatusResult>;
  listProviders(): Promise<ProviderKey[]>;
  listSessionModels(runtime: string): Promise<SessionModelOption[]>;
  saveProviders(keys: ProviderKeyInput[]): Promise<{ ok: boolean; error?: string }>;
  deleteProvider(providerIndex: number): Promise<void>;
  activateProvider(providerIndex: number): Promise<{ ok: boolean; activeIndex?: number }>;
  testProvider(providerIndex: number): Promise<ProviderTestResult>;
  testProviderKey(key: string, model: string, baseUrl: string, runtime?: string): Promise<ProviderTestResult>;
  subscribeRunEvents(runId: string, listener: (event: RunEvent) => void): () => void;
}
