import { spawn, type ChildProcess } from 'node:child_process';
import os from 'node:os';
import { delimiter, join } from 'node:path';
import { ServiceStartupError, serviceExitError, serviceSpawnError } from '../serviceStartupError';
import { setTimeout as delay } from 'node:timers/promises';

import { DEFAULT_INSIGHT_PORT } from '../shared/localServicePorts';
export const insightBaseUrl = `http://127.0.0.1:${DEFAULT_INSIGHT_PORT}`;

let child: ChildProcess | undefined;
let starting: Promise<void> | undefined;
let stopping = false;

export async function probeInsight(url: string): Promise<boolean> {
  try {
    const response = await fetch(url + '/api/observe/data?pageSize=1', {
      signal: AbortSignal.timeout(1500),
      redirect: 'error',
    });
    if (response.ok) {
      const data = await response.json() as { items?: unknown } | null;
      return Array.isArray(data?.items);
    }
  } catch {
    // A stopped or still-starting instance is reported as unavailable.
  }
  return false;
}

export async function getInsightStatus(): Promise<{ running: boolean; port: number }> {
  return { running: await probeInsight(insightBaseUrl), port: DEFAULT_INSIGHT_PORT };
}

async function startInsight(onStarting?: () => void): Promise<void> {
  if ((await getInsightStatus()).running) return;
  if (stopping) throw new Error('The workbench is closing');
  onStarting?.();
  let startupError: ServiceStartupError | undefined;
  if (!child) {
    const instance = spawn('context-insight', [], {
      cwd: os.homedir(),
      env: {
        ...process.env,
        PATH: [process.env.PATH, join(os.homedir(), '.local', 'bin'), '/usr/local/bin', '/opt/homebrew/bin'].filter(Boolean).join(delimiter),
        CONTEXT_INSIGHT_PORT: String(DEFAULT_INSIGHT_PORT),
        CONTEXT_NO_BROWSER: '1',
      },
      stdio: ['ignore', 'inherit', 'pipe'],
      windowsHide: true,
    });
    child = instance;
    let stderr = '';
    instance.stderr?.on('data', (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-2000); });
    instance.once('error', error => {
      startupError = serviceSpawnError('context-insight', error);
      if (child === instance) child = undefined;
    });
    instance.once('close', (code, signal) => {
      startupError ??= serviceExitError(code, signal, stderr);
      if (child === instance) child = undefined;
    });
  }

  // The CLI can build the Web UI on first launch.
  const deadline = Date.now() + 180_000;
  while (!stopping && Date.now() < deadline) {
    if (startupError) throw startupError;
    if ((await getInsightStatus()).running) return;
    if (startupError) throw startupError;
    if (!child) throw new ServiceStartupError('exited', 'context-insight');
    await delay(500);
  }
  throw new ServiceStartupError('timeout', insightBaseUrl);
}

export function ensureInsightRunning(onStarting?: () => void): Promise<void> {
  starting ??= startInsight(onStarting).finally(() => { starting = undefined; });
  return starting;
}

export function stopInsightIfStarted(): void {
  stopping = true;
  child?.kill();
}
