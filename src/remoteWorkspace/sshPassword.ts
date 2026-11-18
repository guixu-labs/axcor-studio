import { execFile } from 'node:child_process';
import { constants } from 'node:fs';
import { mkdtemp, open, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';
import type { SshTarget } from './sshTransport';

const execute = promisify(execFile);

export interface SshPassword {
  password: string;
  prompt: string;
  askpass: string;
}

export function validateSshPassword(password: unknown): string {
  if (process.platform === 'win32') throw new Error('SSH password login is available on macOS and Linux.');
  if (typeof password !== 'string' || !password || /[\r\n\0]/u.test(password) || Buffer.byteLength(password) > 1023) {
    throw new Error('Enter a valid SSH password.');
  }
  return password;
}

export async function resolveSshPassword(
  target: SshTarget,
  input: unknown,
  askpass: string,
  signal: AbortSignal,
): Promise<SshPassword> {
  const password = validateSshPassword(input);
  const args = ['-G', ...(target.sshPort === undefined ? [] : ['-p', String(target.sshPort)]), '--', target.host];
  const { stdout } = await execute('ssh', args, { signal, timeout: 8000 });
  const config = new Map(
    stdout.split('\n').map(line => {
      const end = line.indexOf(' ');
      return [line.slice(0, end), line.slice(end + 1)];
    }),
  );
  const host = config.get('hostkeyalias') ?? config.get('hostname');
  const user = config.get('user');
  if (!host || !user) throw new Error('Could not resolve the SSH password prompt for this host.');
  return { password, askpass, prompt: `${user}@${host}'s password: ` };
}

export async function startSshAskpass(
  auth: SshPassword,
  signal: AbortSignal,
): Promise<{ env: NodeJS.ProcessEnv; close: () => Promise<void> }> {
  signal.throwIfAborted();
  const directory = await mkdtemp(path.join(tmpdir(), 'axcor-ssh-'));
  const helper = path.join(directory, 'askpass');
  const pipe = path.join(directory, 'password');
  const lifetime = new AbortController();
  const waiting = AbortSignal.any([signal, lifetime.signal, AbortSignal.timeout(20_000)]);
  const cleanup = (): Promise<void> => rm(directory, { recursive: true, force: true });
  try {
    await writeFile(helper, auth.askpass, { mode: 0o700 });
    await execute('mkfifo', ['-m', '600', pipe], { signal: waiting, timeout: 4000 });
  } catch (error) {
    await cleanup();
    throw error;
  }

  // Password bytes pass through the FIFO and are never written to a regular file.
  const deliver = async (): Promise<void> => {
    while (!waiting.aborted) {
      const writer = await open(pipe, constants.O_WRONLY | constants.O_NONBLOCK).catch(
        (error: NodeJS.ErrnoException) => {
          if (error.code === 'ENXIO') return undefined;
          throw error;
        },
      );
      if (writer) {
        try {
          await writer.writeFile(auth.password + '\n');
        } finally {
          await writer.close();
        }
        return;
      }
      await delay(25, undefined, { signal: waiting });
    }
  };
  const delivery = deliver()
    .catch(() => {})
    .finally(cleanup)
    .catch(() => {});
  return {
    env: {
      ...process.env,
      SSH_ASKPASS: helper,
      SSH_ASKPASS_REQUIRE: 'force',
      AXCOR_SSH_PASSWORD_PROMPT: auth.prompt,
      AXCOR_SSH_PASSWORD_PIPE: pipe,
    },
    close: async () => {
      lifetime.abort();
      await delivery;
    },
  };
}
