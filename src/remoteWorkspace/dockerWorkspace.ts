import { execFile, spawn } from 'node:child_process';
import net from 'node:net';
import { promisify } from 'node:util';
import type { DockerContainer } from '../shared/workspace';
import { shellQuote, sshArgs, validateSshTarget, type SshTarget } from './sshTransport';

const containerIdPattern = /^[0-9a-f]{64}$/;
const execFileAsync = promisify(execFile);

export function validateContainerId(id: string): string {
  if (typeof id !== 'string' || !containerIdPattern.test(id)) {
    throw new Error('Select a running Docker container.');
  }
  return id;
}

export async function listDockerContainers(target: SshTarget, signal: AbortSignal): Promise<DockerContainer[]> {
  const args = sshArgs(
    validateSshTarget(target),
    "docker ps --filter status=running --no-trunc --format '{{json .}}'",
  );
  let stdout: string;
  try {
    ({ stdout } = await execFileAsync('ssh', args, { signal, timeout: 15_000, maxBuffer: 4 * 1024 * 1024 }));
  } catch (error) {
    const detail = (error as { stderr?: string }).stderr?.trim();
    throw new Error('Could not list Docker containers: ' + (detail || (error as Error).message));
  }
  return stdout
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(line => {
      const row = JSON.parse(line) as { ID: string; Names: string; Image: string };
      if (typeof row.Names !== 'string' || typeof row.Image !== 'string') {
        throw new Error('Invalid Docker container list.');
      }
      return { id: validateContainerId(row.ID), name: row.Names, image: row.Image };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function dockerExec(containerId: string, command: string): string {
  return 'docker exec -i ' + validateContainerId(containerId) + ' ' + command;
}

export function openDockerForward(
  target: SshTarget,
  containerId: string,
  remotePort: number,
  relaySource: string,
  signal: AbortSignal,
): Promise<number> {
  const command = dockerExec(containerId, 'python3 -c ' + shellQuote(relaySource) + ' ' + remotePort);
  const sockets = new Set<net.Socket>();
  const server = net.createServer({ allowHalfOpen: true }, socket => {
    if (signal.aborted) {
      socket.destroy();
      return;
    }

    sockets.add(socket);
    const child = spawn('ssh', sshArgs(target, command), { stdio: ['pipe', 'pipe', 'ignore'] });
    const close = (): void => {
      sockets.delete(socket);
      child.kill();
    };
    socket.on('error', () => socket.destroy());
    socket.once('close', close);
    child.on('error', () => socket.destroy());
    child.stdin.on('error', () => socket.destroy());
    child.stdout.on('error', () => socket.destroy());
    child.once('close', code => {
      if (code !== 0) socket.destroy();
      else socket.end();
    });
    socket.pipe(child.stdin);
    child.stdout.pipe(socket, { end: false });
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    signal.addEventListener(
      'abort',
      () => {
        for (const socket of sockets) socket.destroy();
        server.close();
      },
      { once: true },
    );
    server.listen({ host: '127.0.0.1', port: 0, signal }, () => {
      resolve((server.address() as net.AddressInfo).port);
    });
    // An abort while the listener is binding may prevent the listen callback.
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    if (signal.aborted) reject(signal.reason);
  });
}
