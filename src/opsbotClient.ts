import { BrowserWindow } from 'electron';
import type { RunEvent } from './shared/protocol';
import { mapEvent, type OpsbotEventPage } from './shared/opsbotApi';
import { getOpsbotRun, isSessionRun, opsbotRequest } from './opsbotHttp';

export { getOpsbotBaseUrl, setOpsbotBaseUrl } from './opsbotHttp';

const POLL_INTERVAL_MS = 1_000;
const POLL_PAGE_SIZE = 200;

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
    if (this.running) return;
    this.running = true;
    try {
      if (isSessionRun(this.runId)) await this.pollSession();
      else await this.pollRunEvents();
    } catch (error) {
      // A down or mid-restart Opsbot is not fatal: keep the cursor and retry
      // on the next tick so a transient outage recovers without a resubscribe.
      console.error(`[opsbot] event poll failed for run ${this.runId}: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.running = false;
    }
  }

  private async pollRunEvents(): Promise<void> {
    let hasMore = true;
    while (hasMore) {
      const params = new URLSearchParams({ limit: String(POLL_PAGE_SIZE) });
      if (this.cursor) params.set('cursor', this.cursor);
      const page = await opsbotRequest<OpsbotEventPage>('GET', `/api/v1/runs/${encodeURIComponent(this.runId)}/events?${params.toString()}`);
      this.cursor = page.next_cursor;
      hasMore = page.events.length >= page.limit;
      for (const raw of page.events) emitOpsbotEvent(mapEvent(raw));
    }
  }

  private async pollSession(): Promise<void> {
    const run = await getOpsbotRun(this.runId);
    if (run.status === this.lastSessionStatus) return;
    this.lastSessionStatus = run.status;
    const event: RunEvent = {
      id: `session-${Date.now()}`,
      runId: this.runId,
      type: 'session_state_changed',
      timestamp: new Date().toISOString(),
      payload: { state: run.status },
    };
    emitOpsbotEvent(event);
  }
}

const pollers = new Map<string, EventPoller>();

function emitOpsbotEvent(event: RunEvent): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send('opsbot:event', event);
  }
}

export function subscribeOpsbotEvents(runId: string): void {
  const existing = pollers.get(runId);
  if (existing) {
    existing.start();
    return;
  }
  const poller = new EventPoller(runId);
  pollers.set(runId, poller);
  poller.start();
}

export function unsubscribeOpsbotEvents(runId: string): void {
  const poller = pollers.get(runId);
  if (!poller) return;
  poller.stop();
  pollers.delete(runId);
}

export function stopAllOpsbotPolls(): void {
  for (const poller of pollers.values()) poller.stop();
  pollers.clear();
}
