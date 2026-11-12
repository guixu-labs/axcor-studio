import { spawn, type ChildProcess } from 'node:child_process';
import os from 'node:os';
import { DEFAULT_EXECUTION_BACKEND_URL, EXECUTION_BACKEND_COMMAND } from '../shared/executionBackendConfig';
import { DEFAULT_EXECUTION_BACKEND_PORT, DEFAULT_INSIGHT_PORT } from '../shared/localServicePorts';

const PROBE_TIMEOUT_MS = 1_500;
const STARTUP_WAIT_MS = 20_000;
const POLL_INTERVAL_MS = 500;

let starting = false;
let spawnedBackend: ChildProcess | undefined;

/**
 * Stop the execution backend this workbench started, if any. Instances
 * that were already running (reused) are never touched.
 */
export function stopExecutionBackendIfStarted(): void {
  const child = spawnedBackend;
  spawnedBackend = undefined;
  if (child && !child.killed) {
    console.log(`[${EXECUTION_BACKEND_COMMAND}] stopping instance started by the workbench (pid ${child.pid})`);
    child.kill();
  }
}

export async function isExecutionBackendReachable(baseUrl = DEFAULT_EXECUTION_BACKEND_URL): Promise<boolean> {
  try {
    const response = await fetch(baseUrl + '/api/v1/runs', { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    if (!response.ok) return false;
    const payload = await response.json() as { runs?: unknown } | null;
    return Array.isArray(payload?.runs);
  } catch {
    return false;
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
    WORKFLOW_CONTROLLER_INSIGHT_PORT: String(DEFAULT_INSIGHT_PORT),
  };
  return new Promise(resolve => {
    const child = spawn(EXECUTION_BACKEND_COMMAND, ['web', '--port', port, '--no-open'], {
      env, cwd: os.homedir(), detached: true, stdio: 'ignore',
    });
    spawnedBackend = child;
    child.once('close', () => { if (spawnedBackend === child) spawnedBackend = undefined; });
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
 * Reuse the local execution backend if its API is ready, or start an instance.
 */
export async function ensureExecutionBackendRunning(onStarting?: () => void, port = DEFAULT_EXECUTION_BACKEND_PORT): Promise<boolean> {
  const baseUrl = `http://127.0.0.1:${port}`;
  if (await isExecutionBackendReachable(baseUrl)) return true;
  if (starting) return false;
  starting = true;
  try {
    onStarting?.();
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
