import { spawn } from 'node:child_process';
import os from 'node:os';
import { getOpsbotBaseUrl } from './opsbotHttp';

const PROBE_TIMEOUT_MS = 1_500;
const STARTUP_WAIT_MS = 20_000;
const POLL_INTERVAL_MS = 500;

let starting = false;

export async function isOpsbotReachable(baseUrl: string = getOpsbotBaseUrl()): Promise<boolean> {
  try {
    const response = await fetch(baseUrl + '/api/v1/runs', { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    return response.ok;
  } catch {
    return false;
  }
}

function localPortOf(baseUrl: string): string | undefined {
  try {
    const url = new URL(baseUrl);
    if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') return undefined;
    return url.port || '18600';
  } catch {
    return undefined;
  }
}

async function spawnOpsbot(port: string): Promise<boolean> {
  // GUI-launched Electron has a minimal PATH, so append the well-known user
  // tool locations after the inherited PATH (which may itself be augmented,
  // e.g. by tests injecting a fixture binary first).
  const pathPrefix = [os.homedir() + '/.local/bin', '/usr/local/bin'].join(':');
  const env = { ...process.env, PATH: (process.env.PATH ?? '') + ':' + pathPrefix };
  const trySpawn = (command: string, args: string[]): Promise<boolean> => new Promise(resolve => {
    const child = spawn(command, args, { env, cwd: os.homedir(), detached: true, stdio: 'ignore' });
    let settled = false;
    child.on('error', (error: NodeJS.ErrnoException) => { if (!settled) { settled = true; console.error(`[opsbot] spawn ${command} failed: ${error.message}`); resolve(false); } });
    child.on('spawn', () => { if (!settled) { settled = true; console.log(`[opsbot] spawned ${command} (pid ${child.pid})`); child.unref(); resolve(true); } });
  });
  if (await trySpawn('opsbot', ['web', '--port', port])) return true;
  return trySpawn('npx', ['opsbot', 'web', '--port', port]);
}

/**
 * Reuse a running Opsbot when its base URL answers, otherwise start a
 * local instance. Only local URLs are auto-started; remote endpoints
 * are left to the user. Returns true when Opsbot ended up reachable.
 */
export async function ensureOpsbotRunning(): Promise<boolean> {
  if (process.env.OPSBOT_NO_AUTOSTART === '1') return false;
  const baseUrl = getOpsbotBaseUrl();
  if (await isOpsbotReachable(baseUrl)) return true;
  const port = localPortOf(baseUrl);
  if (!port) return false;
  if (starting) return false;
  starting = true;
  try {
    const spawned = await spawnOpsbot(port);
    if (!spawned) return false;
    const deadline = Date.now() + STARTUP_WAIT_MS;
    while (Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
      if (await isOpsbotReachable(baseUrl)) return true;
    }
    return false;
  } finally {
    starting = false;
  }
}
