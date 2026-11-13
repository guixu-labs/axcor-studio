import { spawn, type ChildProcess } from 'node:child_process';
import os from 'node:os';
import { ServiceStartupError, serviceExitError, serviceSpawnError } from '../serviceStartupError';
import { DEFAULT_EXECUTION_BACKEND_PORT } from '../shared/localServicePorts';
import { DEFAULT_EXECUTION_BACKEND_URL, EXECUTION_BACKEND_COMMAND } from '../shared/executionBackendConfig';

const PROBE_TIMEOUT_MS = 1_500;
const STARTUP_WAIT_MS = 20_000;
const POLL_INTERVAL_MS = 500;

let starting = false;
type BackendProcess = { child: ChildProcess; port: string; failure?: ServiceStartupError };
let spawnedBackend: BackendProcess | undefined;

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

function spawnExecutionBackend(port: string): Promise<BackendProcess> {
  // GUI-launched Electron has a minimal PATH, so append the well-known user
  // tool locations after the inherited PATH (which may itself be augmented,
  // e.g. by tests injecting a fixture binary first).
  const pathPrefix = [os.homedir() + '/.local/bin', '/usr/local/bin'].join(':');
  const env = {
    ...process.env,
    PATH: (process.env.PATH ?? '') + ':' + pathPrefix,
  };
  return new Promise((resolve, reject) => {
    const child = spawn(EXECUTION_BACKEND_COMMAND, ['web', '--port', port, '--no-open'], {
      env, cwd: os.homedir(), detached: true, stdio: ['ignore', 'ignore', 'pipe'],
    });
    const instance: BackendProcess = { child, port };
    spawnedBackend = instance;
    let stderr = '';
    child.stderr?.on('data', (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-2000); });
    child.once('close', (code, signal) => {
      instance.failure ??= serviceExitError(code, signal, stderr);
      if (spawnedBackend === instance) spawnedBackend = undefined;
    });
    child.once('error', error => {
      instance.failure = serviceSpawnError(EXECUTION_BACKEND_COMMAND, error);
      if (spawnedBackend === instance) spawnedBackend = undefined;
      reject(instance.failure);
    });
    child.once('spawn', () => {
      console.log(`[${EXECUTION_BACKEND_COMMAND}] started (pid ${child.pid})`);
      child.unref();
      resolve(instance);
    });
  });
}

/** Reuse the local execution backend if its API is ready, or start an instance. */
export async function ensureExecutionBackendRunning(
  onStarting?: () => void,
  port = DEFAULT_EXECUTION_BACKEND_PORT,
): Promise<boolean> {
  const baseUrl = `http://127.0.0.1:${port}`;
  if (await isExecutionBackendReachable(baseUrl)) return true;
  if (starting) return false;
  starting = true;
  try {
    onStarting?.();
    if (spawnedBackend && spawnedBackend.port !== port) stopExecutionBackendIfStarted();
    const instance = spawnedBackend ?? await spawnExecutionBackend(port);
    const deadline = Date.now() + STARTUP_WAIT_MS;
    while (Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
      if (await isExecutionBackendReachable(baseUrl)) return true;
      if (instance.failure) throw instance.failure;
    }
    throw new ServiceStartupError('timeout', baseUrl);
  } finally {
    starting = false;
  }
}
