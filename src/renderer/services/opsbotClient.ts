import type { Artifact, CreateRunInput, OpsbotClient, Run, RunEvent } from '../../shared/protocol';

export class MockOpsbotClient implements OpsbotClient {
  private readonly runs = new Map<string, Run>();
  private readonly listeners = new Map<string, Set<(event: RunEvent) => void>>();

  async createRun(input: CreateRunInput): Promise<Run> {
    const now = new Date().toISOString();
    const run: Run = { id: `run_${crypto.randomUUID()}`, workflowId: input.workflowId, status: 'queued', createdAt: now, updatedAt: now };
    this.runs.set(run.id, run);
    this.emit(run, 'run.created', { workflowId: input.workflowId });
    setTimeout(() => this.advance(run.id, 'running', 'run.started'), 250);
    setTimeout(() => this.advance(run.id, 'completed', 'run.completed'), 1250);
    return run;
  }

  async getRun(runId: string): Promise<Run> { const run = this.runs.get(runId); if (!run) throw new Error(`Unknown run: ${runId}`); return run; }
  async cancelRun(runId: string): Promise<void> { this.advance(runId, 'cancelled', 'run.cancelled'); }
  subscribeRunEvents(runId: string, listener: (event: RunEvent) => void): () => void { const listeners = this.listeners.get(runId) ?? new Set(); listeners.add(listener); this.listeners.set(runId, listeners); return () => listeners.delete(listener); }
  async listArtifacts(runId: string): Promise<Artifact[]> { return [{ id: `artifact_${runId}`, runId, type: 'log', name: 'mock-run.log' }]; }

  private advance(runId: string, status: Run['status'], type: RunEvent['type']): void { const run = this.runs.get(runId); if (!run || ['completed', 'cancelled', 'failed'].includes(run.status)) return; run.status = status; run.updatedAt = new Date().toISOString(); this.emit(run, type, { status }); }
  private emit(run: Run, type: RunEvent['type'], payload: unknown): void { const event: RunEvent = { id: crypto.randomUUID(), runId: run.id, type, timestamp: new Date().toISOString(), payload }; this.listeners.get(run.id)?.forEach(listener => listener(event)); }
}
