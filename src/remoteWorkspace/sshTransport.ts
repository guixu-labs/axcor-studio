import { splitSshDestination } from './sshConfig';

export interface SshTarget {
  host: string;
  sshPort?: number;
}

export function validateSshTarget({ host, sshPort }: SshTarget): SshTarget {
  const { hostname, user } = splitSshDestination(host);
  if (sshPort !== undefined && (!Number.isInteger(sshPort) || sshPort < 1 || sshPort > 65535)) {
    throw new Error('Enter a valid SSH port.');
  }
  return {
    host: user ? user + '@' + hostname : hostname,
    ...(sshPort === undefined ? {} : { sshPort }),
  };
}

export function sshArgs(target: SshTarget, command: string, forwards: string[] = []): string[] {
  return [
    '-T',
    '-S',
    'none',
    '-o',
    'ForkAfterAuthentication=no',
    '-o',
    'BatchMode=yes',
    '-o',
    'StrictHostKeyChecking=yes',
    '-o',
    'ForwardAgent=no',
    '-o',
    'ExitOnForwardFailure=yes',
    '-o',
    'ConnectTimeout=8',
    '-o',
    'ServerAliveInterval=5',
    '-o',
    'ServerAliveCountMax=2',
    ...(forwards.length ? forwards.flatMap(forward => ['-L', forward]) : ['-o', 'ClearAllForwardings=yes']),
    ...(target.sshPort === undefined ? [] : ['-p', String(target.sshPort)]),
    '--',
    target.host,
    command,
  ];
}

export function shellQuote(value: string): string {
  return "'" + value.replaceAll("'", "'\\''") + "'";
}
