import { EXECUTION_BACKEND_NAME } from './executionBackendConfig';

export type RunStatus = 'queued' | 'running' | 'paused' | 'failed' | 'completed' | 'cancelled';

export type RunEventType =
  | 'run.created'
  | 'run.started'
  | 'step.started'
  | 'tool.called'
  | 'step.completed'
  | 'run.completed'
  | 'run.cancelled';

export interface Run {
  id: string;
  workflowId: string;
  status: RunStatus;
  createdAt: string;
  updatedAt: string;
  runtimeId: RuntimeId;
  model?: string;
  iteration?: number;
  maxIterations?: number;
  elapsedSeconds?: number;
  contextWindow?: number;
  memberCount?: number;
  runningCount?: number;
}

export type RuntimeId = 'workflow' | 'session';

export const GRAPH_WORKFLOW_FORMAT = 'graph-yaml@1';

export interface RuntimeDescriptor {
  id: RuntimeId;
  label: string;
}

export const RUNTIMES: RuntimeDescriptor[] = [
  { id: 'workflow', label: 'Graph' },
  { id: 'session', label: `${EXECUTION_BACKEND_NAME} Session` },
];

export interface GraphRunParams {
  variables?: string;
  starting_prompt?: string;
  runtime?: string;
  model?: string;
  provider_index?: number;
  system_prompt?: string;
  max_iterations?: number;
  reviewer_enabled?: boolean;
  cli_wrapper?: string;
  evaluator?: string;
  reviewer_model?: string;
  reviewer_provider_index?: number;
  reviewer_task_goal?: string;
  reviewer_thinking_enabled?: boolean;
  reviewer_thinking_budget_tokens?: number;
  model_pinned?: boolean;
}

export interface CreateRunInput {
  workflowId: string;
  workspacePath?: string;
  workspaceId?: string;
  content?: string;
  runtime: RuntimeId;
  programPath?: string;
  format?: string;
  label?: string;
  params?: GraphRunParams;
  maxParallel?: number;
  prompt?: string;
  sessionRuntime?: string;
  model?: string;
  providerIndex?: number;
  systemPrompt?: string;
  maxIterations?: number;
  reviewerEnabled?: boolean;
}

export interface RunEvent {
  id: string;
  runId: string;
  type: string;
  timestamp: string;
  stepId?: string;
  source?: 'run_events' | 'events';
  payload: unknown;
}

export interface Artifact {
  id: string;
  runId: string;
  type: 'file' | 'log' | 'diff' | 'test-report';
  name: string;
  path?: string;
}

export interface ExecutionClient {
  createRun(input: CreateRunInput): Promise<Run>;
  listRuns(): Promise<Run[]>;
  getRun(runId: string): Promise<Run>;
  stopRun(runId: string): Promise<void>;
  subscribeRunEvents(runId: string, listener: (event: RunEvent) => void): () => void;
  listArtifacts(runId: string): Promise<Artifact[]>;
}
