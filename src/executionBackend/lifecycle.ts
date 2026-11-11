import { spawn, type ChildProcess } from 'node:child_process';
import os from 'node:os';
import { insightPort } from '../observability/insightService';
import { getBackendBaseUrl } from './http';
import { DEFAULT_EXECUTION_BACKEND_PORT, EXECUTION_BACKEND_COMMAND } from '../shared/executionBackendConfig';

const PROBE_TIMEOUT_MS = 1_500;
const STARTUP_WAIT_MS = 20_000;
const POLL_INTERVAL_MS = 500;

let starting = false;
let spawnedBackend: { child: ChildProcess; port: string } | undefined;

/**
 * Stop the execution backend this workbench started, if any. Instances
 * that were already running (reused) are never touched.
 */
export function stopExecutionBackendIfStarted(): void {
  const child = spawnedBackend?.child;
  spawnedBackend = undefined;
  if (child && !child.killed) {
    console.log(`[${EXECUTION_BACKEND_COMMAND}] stopping instance started by the workbench (pid ${child.pid})`);
    child.kill();
  }
}

export async function isExecutionBackendReachable(baseUrl: string = getBackendBaseUrl()): Promise<boolean> {
  try {
    const response = await fetch(baseUrl + '/api/v1/runs', { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    if (!response.ok) return false;
    const payload = await response.json() as { runs?: unknown } | null;
    return Array.isArray(payload?.runs);
  } catch {
    return false;
  }
}

function localPortOf(baseUrl: string): string | undefined {
  try {
    const url = new URL(baseUrl);
    if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') return undefined;
    return url.port || DEFAULT_EXECUTION_BACKEND_PORT;
  } catch {
    return undefined;
  }
}

function spawnExecutionBackend(port: string): Promise<boolean> {
  // GUI-launched Electron has a minimal PATH, so append the well-known user
  // tool locations after the inherited PATH (which may itself be augmented,
  // e.g. by tests injecting a fixture binary first).
  const pathPrefix = [os.homedir() + '/.local/bin', '/usr/local/bin'].join(':');
  const env = {
    ...process.env,
    PATH: (process.env.PATH ?? '') + ':' + pathPrefix,
    WORKFLOW_CONTROLLER_INSIGHT_PORT: String(insightPort),
  };
  return new Promise(resolve => {
    const child = spawn(EXECUTION_BACKEND_COMMAND, ['web', '--port', port, '--no-open'], {
      env, cwd: os.homedir(), detached: true, stdio: 'ignore',
    });
    spawnedBackend = { child, port };
    child.once('close', () => { if (spawnedBackend?.child === child) spawnedBackend = undefined; });
    child.once('error', error => {
      console.error(`[${EXECUTION_BACKEND_COMMAND}] startup failed: ${error.message}`);
      resolve(false);
    });
    child.once('spawn', () => {
      console.log(`[${EXECUTION_BACKEND_COMMAND}] started (pid ${child.pid})`);
      child.unref();
      resolve(true);
    });
  });
}

/**
 * Reuse a running execution backend when its base URL answers, otherwise start a
 * local instance. Only local URLs are auto-started; remote endpoints
 * are left to the user. Returns true when the API is reachable.
 */
export async function ensureExecutionBackendRunning(onStarting?: () => void): Promise<boolean> {
  const baseUrl = getBackendBaseUrl();
  if (await isExecutionBackendReachable(baseUrl)) return true;
  if (process.env.EXECUTION_BACKEND_NO_AUTOSTART === '1') return false;
  const port = localPortOf(baseUrl);
  if (!port) return false;
  if (starting) return false;
  starting = true;
  try {
    onStarting?.();
    if (spawnedBackend && spawnedBackend.port !== port) stopExecutionBackendIfStarted();
    const spawned = spawnedBackend || await spawnExecutionBackend(port);
    if (!spawned) return false;
    const deadline = Date.now() + STARTUP_WAIT_MS;
    while (Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
      if (await isExecutionBackendReachable(baseUrl)) return true;
      if (!spawnedBackend) return false;
    }
    return false;
  } finally {
    starting = false;
  }
}
