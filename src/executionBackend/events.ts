import { BrowserWindow } from 'electron';
import { createHash } from 'node:crypto';
import type { RunEvent } from '../shared/protocol';
import { mapEvent, type BackendEventPage, type BackendSessionEventPage } from './api';
import { getRun, isSessionRun, backendRequest, isBackendDisconnected } from './http';

const POLL_INTERVAL_MS = 1_000;
const POLL_PAGE_SIZE = 200;

function isThinkingTokenNotification(type: string, payload: unknown): boolean {
  return type === 'notification' && typeof payload === 'object' && payload !== null
    && 'subtype' in payload && payload.subtype === 'thinking_tokens';
}

class EventPoller {
  private readonly runId: string;
  private timer: NodeJS.Timeout | null = null;
  private cursor: string | undefined;
  private running = false;
  private lastSessionStatus: string | undefined;

  constructor(runId: string) {
    this.runId = runId;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => { void this.poll(); }, POLL_INTERVAL_MS);
    void this.poll();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async poll(): Promise<void> {
    if (this.running || isBackendDisconnected()) return;
    this.running = true;
    try {
      if (isSessionRun(this.runId)) await this.pollSession();
      else await this.pollRunEvents();
    } catch (error) {
      // Keep the cursor and retry if the backend is down or restarting.
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[execution] event poll failed for run ${this.runId}: ${message}`);
    } finally {
      this.running = false;
    }
  }

  private async pollRunEvents(): Promise<void> {
    let hasMore = true;
    while (hasMore) {
      const params = new URLSearchParams({ limit: String(POLL_PAGE_SIZE) });
      if (this.cursor) params.set('cursor', this.cursor);
      const page = await backendRequest<BackendEventPage>(
        'GET',
        `/api/v1/runs/${encodeURIComponent(this.runId)}/events?${params.toString()}`,
      );
      if (!this.timer) return;
      this.cursor = page.next_cursor;
      hasMore = page.events.length >= page.limit;
      for (const raw of page.events) {
        const event = mapEvent(raw);
        if (!isThinkingTokenNotification(event.type, event.payload)) emitExecutionEvent(event);
      }
    }
  }

  private async pollSession(): Promise<void> {
    const run = await getRun(this.runId);
    if (!this.timer) return;
    if (run.status !== this.lastSessionStatus) {
      this.lastSessionStatus = run.status;
      emitExecutionEvent({
        id: `session-${Date.now()}`,
        runId: this.runId,
        type: 'session_state_changed',
        timestamp: new Date().toISOString(),
        payload: { state: run.status },
      });
    }
    const params = new URLSearchParams({ session_id: this.runId });
    if (this.cursor) params.set('cursor', this.cursor);
    else params.set('since', '0');
    const page = await backendRequest<BackendSessionEventPage>('GET', `/api/v1/events?${params.toString()}`);
    if (!this.timer) return;
    this.cursor = page.cursor;
    for (const event of page.events) {
      if (isThinkingTokenNotification(event.event_type, event.data)) continue;
      // The session endpoint can replay the history/cursor boundary and returns rowid=0.
      const id = createHash('sha256')
        .update(JSON.stringify([event.timestamp, event.event_type, event.iteration, event.data]))
        .digest('base64url');
      emitExecutionEvent({
        id,
        runId: this.runId,
        type: event.event_type,
        timestamp: event.timestamp,
        payload: event.data,
      });
    }
  }
}

const pollers = new Map<string, EventPoller>();

function emitExecutionEvent(event: RunEvent): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send('execution:event', event);
  }
}

export function subscribeExecutionEvents(runId: string): void {
  const existing = pollers.get(runId);
  if (existing) {
    existing.start();
    return;
  }
  const poller = new EventPoller(runId);
  pollers.set(runId, poller);
  poller.start();
}

export function unsubscribeExecutionEvents(runId: string): void {
  const poller = pollers.get(runId);
  if (!poller) return;
  poller.stop();
  pollers.delete(runId);
}

export function stopAllExecutionPolls(): void {
  for (const poller of pollers.values()) poller.stop();
  pollers.clear();
}
