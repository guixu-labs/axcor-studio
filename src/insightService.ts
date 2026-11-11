import { spawn, type ChildProcess } from 'node:child_process';
import os from 'node:os';
import { delimiter, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

export const insightPort = Number(process.env.CONTEXT_INSIGHT_PORT || '21025');
export const insightBaseUrl = `http://127.0.0.1:${insightPort}`;

let child: ChildProcess | undefined;
let starting: Promise<void> | undefined;
let stopping = false;

export async function getInsightStatus(): Promise<{ running: boolean; port: number }> {
  let running = false;
  try {
    const response = await fetch(insightBaseUrl + '/api/observe/data?pageSize=1', {
      signal: AbortSignal.timeout(1500),
      redirect: 'error',
    });
    if (response.ok) {
      const data = await response.json() as { items?: unknown } | null;
      running = Array.isArray(data?.items);
    }
  } catch {
    // A stopped or still-starting instance is reported as unavailable.
  }
  return { running, port: insightPort };
}

async function startInsight(): Promise<void> {
  if (!Number.isInteger(insightPort) || insightPort < 1 || insightPort > 65535) {
    throw new Error('CONTEXT_INSIGHT_PORT must be a valid TCP port');
  }
  if ((await getInsightStatus()).running) return;
  if (stopping) throw new Error('The workbench is closing');
  if (process.env.CONTEXT_INSIGHT_NO_AUTOSTART === '1') {
    throw new Error(`Context Insight is unavailable at ${insightBaseUrl}`);
  }

  let startupError: Error | undefined;
  if (!child) {
    const instance = spawn('context-insight', [], {
      cwd: os.homedir(),
      env: {
        ...process.env,
        PATH: [process.env.PATH, join(os.homedir(), '.local', 'bin'), '/usr/local/bin', '/opt/homebrew/bin'].filter(Boolean).join(delimiter),
        CONTEXT_INSIGHT_PORT: String(insightPort),
        CONTEXT_NO_BROWSER: '1',
      },
      stdio: ['ignore', 'inherit', 'inherit'],
      windowsHide: true,
    });
    child = instance;
    instance.once('error', error => {
      startupError = error;
      console.error('[context-insight]', error.message);
    });
    instance.once('close', () => {
      if (child === instance) child = undefined;
    });
  }

  // The CLI can build the Web UI on first launch.
  const deadline = Date.now() + 180_000;
  while (!stopping && Date.now() < deadline) {
    if (startupError) throw startupError;
    if ((await getInsightStatus()).running) return;
    if (!child) throw new Error('context-insight exited before it was ready');
    await delay(500);
  }
  throw new Error(`Context Insight did not become ready at ${insightBaseUrl}`);
}

export function ensureInsightRunning(): Promise<void> {
  starting ??= startInsight().finally(() => { starting = undefined; });
  return starting;
}

export function stopInsightIfStarted(): void {
  stopping = true;
  child?.kill();
}
