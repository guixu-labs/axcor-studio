import fs from 'node:fs/promises';
import { isIP } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { SshHostEntry } from './shared/workspace';

const HOST_NAME = /^[a-zA-Z0-9_][a-zA-Z0-9_.-]*$/;
const MAX_INCLUDE_DEPTH = 16;

export function splitSshDestination(value: string): { hostname: string; user?: string } {
  const [first, second, ...extra] = value.trim().split('@');
  const hostname = (second ?? first).replace(/^\[([^\]]+)\]$/, '$1');
  const user = second === undefined ? undefined : first;
  if (
    extra.length ||
    (user !== undefined && !HOST_NAME.test(user)) ||
    (!HOST_NAME.test(hostname) && isIP(hostname) !== 6)
  ) {
    throw new Error('Enter an SSH host alias or user@host.');
  }
  return { hostname, ...(user === undefined ? {} : { user }) };
}

function missing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === 'ENOENT';
}

function directive(line: string): { key: string; args: string[] } | undefined {
  const match = /^\s*(Host|Include)(?:\s*=\s*|\s+)(.*)$/i.exec(line);
  if (!match) return undefined;
  const args = [];
  for (const token of match[2].match(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s#]+|#/g) ?? []) {
    if (token === '#') break;
    args.push(token.replace(/^(["'])(.*)\1$/, '$2'));
  }
  return { key: match[1].toLowerCase(), args };
}

async function expandInclude(pattern: string): Promise<string[]> {
  const { root } = path.parse(pattern);
  let candidates = [root];
  for (const segment of pattern.slice(root.length).split(path.sep)) {
    if (!/[*?[]/.test(segment)) {
      candidates = candidates.map(candidate => path.join(candidate, segment));
      continue;
    }
    const matches: string[] = [];
    for (const candidate of candidates) {
      const names = await fs.readdir(candidate).catch(error => {
        if (missing(error) || (error as NodeJS.ErrnoException).code === 'ENOTDIR') return [];
        throw error;
      });
      for (const name of names.sort()) {
        if (path.matchesGlob(name, segment)) matches.push(path.join(candidate, name));
      }
    }
    candidates = matches;
  }
  return candidates;
}

export async function listSshHosts(home = os.homedir()): Promise<string[]> {
  const sshDir = path.join(home, '.ssh');
  const aliases = new Map<string, string>();
  const visited = new Set<string>();

  async function scan(file: string, depth: number): Promise<void> {
    if (depth > MAX_INCLUDE_DEPTH) return;
    const resolved = await fs.realpath(file).catch(error => {
      if (missing(error)) return undefined;
      throw error;
    });
    if (!resolved || visited.has(resolved) || !(await fs.stat(resolved)).isFile()) return;
    visited.add(resolved);
    const contents = await fs.readFile(resolved, 'utf8');
    for (const line of contents.split(/\r?\n/)) {
      const entry = directive(line);
      if (!entry) continue;
      if (entry.key === 'host') {
        for (const alias of entry.args) {
          if ((HOST_NAME.test(alias) || isIP(alias) === 6) && !aliases.has(alias.toLowerCase())) {
            aliases.set(alias.toLowerCase(), alias);
          }
        }
      } else {
        for (const arg of entry.args) {
          const expanded = arg.replace(
            /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g,
            (token, key: string) => process.env[key] ?? token,
          );
          const pattern = expanded.replace(/^~(?=\/)/, home).replace(/%d/g, home);
          if (/^~|\$\{|%[A-Za-z]/.test(pattern)) continue;
          for (const include of await expandInclude(path.resolve(sshDir, pattern))) await scan(include, depth + 1);
        }
      }
    }
  }

  await scan(path.join(sshDir, 'config'), 0);
  return [...aliases.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

export async function saveSshHost(input: SshHostEntry, home = os.homedir()): Promise<string> {
  const alias = input.alias.trim();
  const { hostname, user } = splitSshDestination(input.destination);
  const port = input.port;
  if (!HOST_NAME.test(alias))
    throw new Error('Enter an SSH alias with letters, numbers, dots, dashes or underscores.');
  if (port !== undefined && (!Number.isInteger(port) || port < 1 || port > 65535))
    throw new Error('Enter a valid SSH port.');

  const sshDir = path.join(home, '.ssh');
  await fs.mkdir(sshDir, { recursive: true, mode: 0o700 });
  const config = path.join(sshDir, 'config');
  const lockPath = path.join(sshDir, 'config.axcor.lock');
  const lock = await fs.open(lockPath, 'wx', 0o600).catch(error => {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST')
      throw new Error('SSH config is being updated. Retry shortly.');
    throw error;
  });
  try {
    if ((await listSshHosts(home)).some(host => host.toLowerCase() === alias.toLowerCase())) {
      throw new Error('This SSH alias already exists. Choose a different alias.');
    }
    const existing = await fs.lstat(config).catch(error => {
      if (missing(error)) return undefined;
      throw error;
    });
    const target = existing ? await fs.realpath(config) : config;
    const metadata = existing ? await fs.stat(target) : undefined;
    if (metadata && !metadata.isFile()) throw new Error('SSH config must be a regular file.');
    const original = metadata ? await fs.readFile(target) : Buffer.alloc(0);
    const newline = original.includes('\r\n') ? '\r\n' : '\n';
    const lines = [`Host ${alias}`, `  HostName ${hostname}`];
    if (user) lines.push(`  User ${user}`);
    if (port !== undefined) lines.push(`  Port ${port}`);
    // Preserve the scope of any directives before the original first Host/Match
    // block, while letting the new host's explicit values precede wildcard defaults.
    if (original.length) lines.push('', 'Host *');
    const prefix = lines.join(newline) + newline + newline;
    const temporary = path.join(path.dirname(target), '.axcor-ssh-' + randomUUID());
    try {
      const mode = metadata ? metadata.mode & 0o777 : 0o600;
      await fs.writeFile(temporary, Buffer.concat([Buffer.from(prefix), original]), { flag: 'wx', mode });
      await fs.chmod(temporary, mode);
      if (metadata) {
        if ((await fs.realpath(config)) !== target || !(await fs.readFile(target)).equals(original)) {
          throw new Error('SSH config changed while saving. Try again.');
        }
        await fs.rename(temporary, target);
      } else {
        // Linking a new config cannot replace a file created by another process.
        await fs.link(temporary, target);
      }
    } finally {
      await fs.rm(temporary, { force: true });
    }
    return alias;
  } finally {
    await lock.close();
    await fs.unlink(lockPath);
  }
}
