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
}

export interface CreateRunInput {
  workflowId: string;
  workspacePath?: string;
  content?: string;
}

export interface RunEvent {
  id: string;
  runId: string;
  type: string;
  timestamp: string;
  stepId?: string;
  payload: unknown;
}

export interface Artifact {
  id: string;
  runId: string;
  type: 'file' | 'log' | 'diff' | 'test-report';
  name: string;
  path?: string;
}

export interface OpsbotClient {
  createRun(input: CreateRunInput): Promise<Run>;
  listRuns(): Promise<Run[]>;
  getRun(runId: string): Promise<Run>;
  cancelRun(runId: string): Promise<void>;
  subscribeRunEvents(runId: string, listener: (event: RunEvent) => void): () => void;
  listArtifacts(runId: string): Promise<Artifact[]>;
}
