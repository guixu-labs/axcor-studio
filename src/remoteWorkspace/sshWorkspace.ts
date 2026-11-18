import { spawn } from 'node:child_process';
import net from 'node:net';
import { createInterface } from 'node:readline';
import { setTimeout as delay } from 'node:timers/promises';
import {
  DEFAULT_REMOTE_INSIGHT_PORT,
  type RemoteWorkspaceConfig,
  type WorkspaceFileChange,
} from '../shared/workspace';
import { ServiceStartupError } from '../serviceStartupError';
import { shellQuote, sshArgs, validateSshTarget } from './sshTransport';
import { dockerExec, openDockerForward, validateContainerId } from './dockerWorkspace';
import { resolveSshPassword, startSshAskpass } from './sshPassword';
import { probeInsight } from '../observability/insightService';

const REQUEST_TIMEOUT = 20_000;

export function validateRemoteConfig(input: RemoteWorkspaceConfig): RemoteWorkspaceConfig {
  const target = validateSshTarget(input);
  const root = input.root.trim().replace(/\/+$/, '');
  const controllerPort = input.controllerPort;
  if (
    !root.startsWith('/') ||
    root
      .slice(1)
      .split('/')
      .some(part => !part || part === '..' || part === '.' || part.includes('\0'))
  ) {
    throw new Error('Enter an absolute Linux directory path.');
  }
  if (!Number.isInteger(controllerPort) || controllerPort < 1 || controllerPort > 65535) {
    throw new Error('Enter a valid Workflow Controller port.');
  }
  const insightPort = input.insightPort;
  if (insightPort !== undefined && (!Number.isInteger(insightPort) || insightPort < 1 || insightPort > 65535)) {
    throw new Error('Enter a valid Context Insight port.');
  }
  if ((insightPort ?? DEFAULT_REMOTE_INSIGHT_PORT) === controllerPort)
    throw new Error('Controller and Context Insight require different ports.');
  return {
    ...target,
    ...(input.authentication === 'password' ? { authentication: 'password' } : {}),
    root,
    controllerPort,
    ...(input.container === undefined
      ? {}
      : {
          container: {
            id: validateContainerId(input.container.id),
            name: typeof input.container.name === 'string' ? input.container.name.trim().slice(0, 255) : '',
          },
        }),
    ...(insightPort === undefined ? {} : { insightPort }),
  };
}

async function availablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const socket = net.createServer();
    socket.once('error', reject);
    socket.listen(0, '127.0.0.1', () => {
      const port = (socket.address() as net.AddressInfo).port;
      socket.close(error => (error ? reject(error) : resolve(port)));
    });
  });
}

export interface RemoteWorkspaceScripts {
  helper: string;
  helperBootstrap: string;
  dockerRelay: string;
  sshAskpass: string;
}

type Reply = { value?: unknown; error?: string };

export class SshWorkspace {
  onFilesChanged?: (change: WorkspaceFileChange) => void;
  private readonly child;
  private queue = Promise.resolve();
  private pending?: (error?: Error, reply?: Reply) => void;
  private stderr = '';
  private closed = false;
  private readonly probeTimeout: number;
  private startingInsight?: Promise<void>;
  private readonly remoteInsightPort: number;

  private constructor(
    config: RemoteWorkspaceConfig,
    scripts: RemoteWorkspaceScripts,
    port: number,
    insightPort: number,
    env: NodeJS.ProcessEnv | undefined,
    private readonly lifetime: AbortController,
    private readonly onClose: (session: SshWorkspace) => void,
  ) {
    this.url = `http://127.0.0.1:${port}`;
    this.insightUrl = `http://127.0.0.1:${insightPort}`;
    this.remoteInsightPort = config.insightPort ?? DEFAULT_REMOTE_INSIGHT_PORT;
    this.probeTimeout = config.container ? 5000 : 1500;
    const helperCommand = 'python3 -c ' + shellQuote(scripts.helperBootstrap);
    const args = config.container
      ? sshArgs(config, dockerExec(config.container.id, helperCommand), [], Boolean(env))
      : sshArgs(
          config,
          helperCommand,
          [
            `127.0.0.1:${port}:127.0.0.1:${config.controllerPort}`,
            `127.0.0.1:${insightPort}:127.0.0.1:${this.remoteInsightPort}`,
          ],
          Boolean(env),
        );
    this.child = spawn('ssh', args, { stdio: ['pipe', 'pipe', 'pipe'], env });
    this.child.stderr.on('data', (chunk: Buffer) => {
      this.stderr = (this.stderr + chunk.toString()).slice(-2000);
    });
    this.child.stdin.on('error', () => {
      /* The child close event reports the process error. */
    });
    this.child.once('error', error => this.finish(error));
    this.child.once('close', () => {
      if (config.container && /no such container|is not running|is paused/i.test(this.stderr)) {
        this.finish(
          new Error('Docker container is unavailable. Reopen the remote workspace and select a running container.'),
        );
      } else {
        this.finish();
      }
    });
    createInterface({ input: this.child.stdout, crlfDelay: Infinity }).on('line', line => {
      try {
        const reply = JSON.parse(line) as Reply & Partial<WorkspaceFileChange> & { event?: string };
        if (
          reply?.event === 'files-changed' &&
          typeof reply.tree === 'boolean' &&
          (reply.paths === null ||
            (Array.isArray(reply.paths) && reply.paths.every(path => typeof path === 'string')))
        ) {
          this.onFilesChanged?.({ tree: reply.tree, paths: reply.paths });
          return;
        }
        if (!this.pending || !reply || (!('value' in reply) && typeof reply.error !== 'string')) {
          throw new Error('Unexpected workspace helper response.');
        }
        this.pending(undefined, reply);
      } catch {
        this.finish(
          new Error('Invalid workspace helper response. Check the helper installation and SSH shell output.'),
        );
      }
    });
    this.child.stdin.write(JSON.stringify(scripts.helper) + '\n');
  }

  readonly url: string;
  readonly insightUrl: string;
  get connected(): boolean {
    return !this.closed;
  }

  static async connect(
    config: RemoteWorkspaceConfig,
    scripts: RemoteWorkspaceScripts,
    onClose: (session: SshWorkspace) => void,
    onStarting?: () => void,
    signal?: AbortSignal,
    password?: string,
  ): Promise<SshWorkspace> {
    const lifetime = new AbortController();
    let session: SshWorkspace | undefined;
    const cancel = (): void => {
      lifetime.abort(signal?.reason);
      session?.close();
    };
    signal?.addEventListener('abort', cancel, { once: true });
    try {
      signal?.throwIfAborted();
      const auth =
        config.authentication === 'password'
          ? await resolveSshPassword(config, password, scripts.sshAskpass, lifetime.signal)
          : undefined;
      let port: number;
      let insightPort: number;
      if (config.container) {
        [port, insightPort] = await Promise.all([
          openDockerForward(
            config,
            config.container.id,
            config.controllerPort,
            scripts.dockerRelay,
            lifetime.signal,
            auth,
          ),
          openDockerForward(
            config,
            config.container.id,
            config.insightPort ?? DEFAULT_REMOTE_INSIGHT_PORT,
            scripts.dockerRelay,
            lifetime.signal,
            auth,
          ),
        ]);
      } else {
        port = await availablePort();
        insightPort = await availablePort();
        while (insightPort === port) insightPort = await availablePort();
      }
      signal?.throwIfAborted();
      const askpass = auth ? await startSshAskpass(auth, lifetime.signal) : undefined;
      const connected = new SshWorkspace(config, scripts, port, insightPort, askpass?.env, lifetime, onClose);
      session = connected;
      if ((await session.request<string>('open', { root: config.root })) !== config.root)
        throw new Error('Unexpected remote workspace path.');
      await session.ensureService(
        'controller',
        config.controllerPort,
        async () => {
          const response = await fetch(connected.url + '/api/v1/runs', {
            signal: AbortSignal.timeout(connected.probeTimeout),
            redirect: 'error',
          }).catch(() => undefined);
          return Boolean(response?.ok && Array.isArray((await response.json().catch(() => null))?.runs));
        },
        onStarting,
      );
      if (!session.connected) throw new Error('SSH connection closed.');
      return session;
    } catch (error) {
      lifetime.abort(error);
      session?.close();
      throw error;
    } finally {
      signal?.removeEventListener('abort', cancel);
    }
  }

  ensureInsight(onStarting?: () => void): Promise<void> {
    this.startingInsight ??= this.ensureService(
      'insight',
      this.remoteInsightPort,
      () => probeInsight(this.insightUrl, this.probeTimeout),
      onStarting,
    ).finally(() => {
      this.startingInsight = undefined;
    });
    return this.startingInsight;
  }

  private async ensureService(
    service: 'controller' | 'insight',
    port: number,
    probe: () => Promise<boolean>,
    onStarting?: () => void,
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
      throw new ServiceStartupError(
        'missing-command',
        service === 'controller' ? 'workflow-controller' : 'context-insight',
      );
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
    const result = this.queue.then(
      () =>
        new Promise<T>((resolve, reject) => {
          if (this.closed) {
            reject(new Error('SSH workspace is disconnected. Reconnect and retry.'));
            return;
          }
          const timeout = setTimeout(
            () => this.finish(new Error('SSH workspace request timed out. Reconnect and retry.')),
            REQUEST_TIMEOUT,
          );
          this.pending = (error, reply) => {
            clearTimeout(timeout);
            this.pending = undefined;
            if (error || reply?.error !== undefined) reject(error ?? new Error(reply?.error));
            else resolve(reply?.value as T);
          };
          this.child.stdin.write(JSON.stringify({ action, ...fields }) + '\n');
        }),
    );
    this.queue = result.then(
      () => {},
      () => {},
    );
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

  close(): void {
    this.finish();
  }
}
