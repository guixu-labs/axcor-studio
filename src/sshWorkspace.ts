import { spawn } from 'node:child_process';
import net from 'node:net';
import { createInterface } from 'node:readline';
import { setTimeout as delay } from 'node:timers/promises';
import { DEFAULT_REMOTE_INSIGHT_PORT, type RemoteWorkspaceConfig, type WorkspaceFileChange } from './shared/workspace';
import { ServiceStartupError } from './serviceStartupError';
import { splitSshDestination } from './sshConfig';
import { probeInsight } from './observability/insightService';

const REQUEST_TIMEOUT = 20_000;

const HELPER_BOOTSTRAP = `
import hashlib
import json
import os
from pathlib import Path
import runpy
import sys
import tempfile

try:
    source = json.loads(sys.stdin.buffer.readline()).encode('utf-8')
    directory = Path.home() / '.local' / 'share' / 'axcor-studio' / 'helpers'
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    helper = directory / (hashlib.sha256(source).hexdigest() + '.py')
    if helper.is_symlink() or not helper.is_file() or helper.read_bytes() != source:
        staging = tempfile.NamedTemporaryFile(dir=directory, delete=False)
        temporary = Path(staging.name)
        try:
            with staging:
                staging.write(source)
            os.replace(temporary, helper)
        finally:
            temporary.unlink(missing_ok=True)
except (OSError, ValueError, AttributeError) as error:
    sys.exit(f'Could not install axcor-workspace-helper: {error}')

# Run in this interpreter so any buffered SSH input remains available.
sys.argv = [str(helper), '--stdio']
runpy.run_path(str(helper), run_name='__main__')
`;
const HELPER_COMMAND = "python3 -c '" + HELPER_BOOTSTRAP.replaceAll("'", "'\\''") + "'";

export function validateRemoteConfig(input: RemoteWorkspaceConfig): RemoteWorkspaceConfig {
  const { hostname, user } = splitSshDestination(input.host);
  const host = user ? user + '@' + hostname : hostname;
  const root = input.root.trim().replace(/\/+$/, '');
  const controllerPort = input.controllerPort;
  const sshPort = input.sshPort;
  if (sshPort !== undefined && (!Number.isInteger(sshPort) || sshPort < 1 || sshPort > 65535)) {
    throw new Error('Enter a valid SSH port.');
  }
  if (!root.startsWith('/') || root.slice(1).split('/').some(part => !part || part === '..' || part === '.' || part.includes('\0'))) {
    throw new Error('Enter an absolute Linux directory path.');
  }
  if (!Number.isInteger(controllerPort) || controllerPort < 1 || controllerPort > 65535) {
    throw new Error('Enter a valid Workflow Controller port.');
  }
  const insightPort = input.insightPort;
  if (insightPort !== undefined && (!Number.isInteger(insightPort) || insightPort < 1 || insightPort > 65535)) {
    throw new Error('Enter a valid Context Insight port.');
  }
  if ((insightPort ?? DEFAULT_REMOTE_INSIGHT_PORT) === controllerPort) throw new Error('Controller and Context Insight require different ports.');
  return { host, root, controllerPort, ...(sshPort === undefined ? {} : { sshPort }), ...(insightPort === undefined ? {} : { insightPort }) };
}

async function availablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const socket = net.createServer();
    socket.once('error', reject);
    socket.listen(0, '127.0.0.1', () => {
      const port = (socket.address() as net.AddressInfo).port;
      socket.close(error => error ? reject(error) : resolve(port));
    });
  });
}

type Reply = { value?: unknown; error?: string };

export class SshWorkspace {
  onFilesChanged?: (change: WorkspaceFileChange) => void;
  private readonly child;
  private queue = Promise.resolve();
  private pending?: (error?: Error, reply?: Reply) => void;
  private stderr = '';
  private closed = false;
  private readonly lifetime = new AbortController();
  private startingInsight?: Promise<void>;
  private readonly remoteInsightPort: number;

  private constructor(
    config: RemoteWorkspaceConfig, helper: string, port: number, insightPort: number,
    private readonly onClose: (session: SshWorkspace) => void,
  ) {
    this.url = `http://127.0.0.1:${port}`;
    this.insightUrl = `http://127.0.0.1:${insightPort}`;
    this.remoteInsightPort = config.insightPort ?? DEFAULT_REMOTE_INSIGHT_PORT;
    this.child = spawn('ssh', [
      '-T', '-S', 'none', '-o', 'ForkAfterAuthentication=no', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes',
      '-o', 'ForwardAgent=no', '-o', 'ExitOnForwardFailure=yes', '-o', 'ConnectTimeout=8',
      '-o', 'ServerAliveInterval=5', '-o', 'ServerAliveCountMax=2',
      '-L', `127.0.0.1:${port}:127.0.0.1:${config.controllerPort}`,
      '-L', `127.0.0.1:${insightPort}:127.0.0.1:${this.remoteInsightPort}`,
      ...(config.sshPort === undefined ? [] : ['-p', String(config.sshPort)]),
      '--', config.host, HELPER_COMMAND,
    ], { stdio: ['pipe', 'pipe', 'pipe'] });
    this.child.stderr.on('data', (chunk: Buffer) => { this.stderr = (this.stderr + chunk.toString()).slice(-2000); });
    this.child.stdin.on('error', () => this.finish());
    this.child.once('error', error => this.finish(error));
    this.child.once('close', () => this.finish());
    createInterface({ input: this.child.stdout, crlfDelay: Infinity }).on('line', line => {
      try {
        const reply = JSON.parse(line) as Reply & Partial<WorkspaceFileChange> & { event?: string };
        if (reply?.event === 'files-changed' && typeof reply.tree === 'boolean'
          && (reply.paths === null || Array.isArray(reply.paths) && reply.paths.every(path => typeof path === 'string'))) {
          this.onFilesChanged?.({ tree: reply.tree, paths: reply.paths });
          return;
        }
        if (!this.pending || !reply || (!('value' in reply) && typeof reply.error !== 'string')) {
          throw new Error('Unexpected workspace helper response.');
        }
        this.pending(undefined, reply);
      } catch {
        this.finish(new Error('Invalid workspace helper response. Check the helper installation and SSH shell output.'));
      }
    });
    this.child.stdin.write(JSON.stringify(helper) + '\n');
  }

  readonly url: string;
  readonly insightUrl: string;
  get connected(): boolean { return !this.closed; }

  static async connect(
    config: RemoteWorkspaceConfig, helper: string, onClose: (session: SshWorkspace) => void, onStarting?: () => void,
  ): Promise<SshWorkspace> {
    const port = await availablePort();
    let insightPort = await availablePort();
    while (insightPort === port) insightPort = await availablePort();
    const session = new SshWorkspace(config, helper, port, insightPort, onClose);
    try {
      if (await session.request<string>('open', { root: config.root }) !== config.root) throw new Error('Unexpected remote workspace path.');
      await session.ensureService('controller', config.controllerPort, async () => {
        const response = await fetch(session.url + '/api/v1/runs', {
          signal: AbortSignal.timeout(1500), redirect: 'error',
        }).catch(() => undefined);
        return Boolean(response?.ok && Array.isArray((await response.json().catch(() => null))?.runs));
      }, onStarting);
      if (!session.connected) throw new Error('SSH connection closed.');
      return session;
    } catch (error) {
      session.close();
      throw error;
    }
  }

  ensureInsight(onStarting?: () => void): Promise<void> {
    this.startingInsight ??= this.ensureService('insight', this.remoteInsightPort, () => probeInsight(this.insightUrl), onStarting)
      .finally(() => { this.startingInsight = undefined; });
    return this.startingInsight;
  }

  private async ensureService(
    service: 'controller' | 'insight', port: number, probe: () => Promise<boolean>, onStarting?: () => void,
  ): Promise<void> {
    const signal = this.lifetime.signal;
    const ready = async (): Promise<boolean> => {
      const running = await probe();
      signal.throwIfAborted();
      return running;
    };
    if (await ready()) return;
    onStarting?.();
    const fields = { port };
    const started = await this.request<string>(service + '-start', fields);
    if (started === 'missing-command') {
      throw new ServiceStartupError('missing-command', service === 'controller' ? 'workflow-controller' : 'context-insight');
    }
    if (started === 'occupied') {
      if (await ready()) return;
      throw new ServiceStartupError('occupied', String(port));
    }
    const deadline = Date.now() + (service === 'insight' ? 180_000 : 45_000);
    while (Date.now() < deadline) {
      if (await ready()) return;
      const state = await this.request<string>(service + '-state', fields);
      if (state === 'stopped') {
        if (await ready()) return;
        throw new ServiceStartupError('exited', `~/.local/state/axcor-studio/${service}-${port}.log`);
      }
      await delay(500, undefined, { signal });
    }
    throw new ServiceStartupError('timeout', `~/.local/state/axcor-studio/${service}-${port}.log`);
  }

  request<T>(action: string, fields: Record<string, unknown> = {}): Promise<T> {
    const result = this.queue.then(() => new Promise<T>((resolve, reject) => {
      if (this.closed) { reject(new Error('SSH workspace is disconnected. Reconnect and retry.')); return; }
      const timeout = setTimeout(() => this.finish(new Error('SSH workspace request timed out. Reconnect and retry.')), REQUEST_TIMEOUT);
      this.pending = (error, reply) => {
        clearTimeout(timeout);
        this.pending = undefined;
        if (error || reply?.error !== undefined) reject(error ?? new Error(reply?.error));
        else resolve(reply?.value as T);
      };
      this.child.stdin.write(JSON.stringify({ action, ...fields }) + '\n');
    }));
    this.queue = result.then(() => {}, () => {});
    return result;
  }

  private finish(error = new Error(this.stderr.trim() || 'SSH connection closed. Reconnect and retry.')): void {
    if (this.closed) return;
    this.closed = true;
    this.lifetime.abort(error);
    this.pending?.(error);
    this.child.kill();
    this.onClose(this);
  }

  close(): void { this.finish(); }
}
