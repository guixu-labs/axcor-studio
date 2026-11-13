import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { listSshHosts, saveSshHost, splitSshDestination } from '../src/sshConfig';

test('lists named SSH hosts from the user config and nested Include files', async t => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'axcor-ssh-config-'));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const sshDir = path.join(home, '.ssh');
  const includes = path.join(sshDir, 'team configs');
  assert.deepEqual(await listSshHosts(home), []);
  await fs.mkdir(includes, { recursive: true });
  await fs.writeFile(
    path.join(sshDir, 'config'),
    [
      '# Host comment',
      'Host * !excluded test-??',
      'Host = "dev-box" another # ignored',
      'Include "team configs/*.conf" missing.conf',
      'Match all',
      '  ServerAliveInterval 10',
    ].join('\n'),
  );
  await fs.writeFile(path.join(includes, 'staging.conf'), 'host Staging DEV-BOX\nInclude config\n');
  await fs.writeFile(path.join(includes, 'ignored.txt'), 'Host ignored-file\n');
  assert.deepEqual(await listSshHosts(home), ['another', 'dev-box', 'Staging']);
  await assert.rejects(saveSshHost({ alias: 'staging', destination: 'user@other' }, home), /alias already exists/);
});

test('writes an explicit host without replacing existing config bytes or symlink', async t => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'axcor-ssh-save-'));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const sshDir = path.join(home, '.ssh');
  const config = path.join(sshDir, 'config');
  const target = path.join(home, 'dotfile');
  const original = '# Keep this comment\nUser fallback\nHost *\n  Port 22\n';
  await fs.mkdir(sshDir);
  await fs.writeFile(target, original, { mode: 0o600 });
  await fs.symlink(target, config);
  assert.equal(await saveSshHost({ alias: 'lab', destination: 'ubuntu@lab.example', port: 2200 }, home), 'lab');
  assert.equal(await fs.readlink(config), target);
  const updated = await fs.readFile(target, 'utf8');
  assert.ok(updated.startsWith('Host lab\n  HostName lab.example\n  User ubuntu\n  Port 2200\n'));
  assert.ok(updated.endsWith(original));
  assert.equal((await fs.stat(target)).mode & 0o777, 0o600);
  assert.deepEqual(await listSshHosts(home), ['lab']);

  if (spawnSync('ssh', ['-V']).status === 0) {
    const saved = spawnSync('ssh', ['-G', '-F', config, 'lab'], { encoding: 'utf8' });
    assert.equal(saved.status, 0, saved.stderr);
    assert.match(saved.stdout, /^hostname lab\.example$/m);
    assert.match(saved.stdout, /^user ubuntu$/m);
    assert.match(saved.stdout, /^port 2200$/m);
    const other = spawnSync('ssh', ['-G', '-F', config, 'other'], { encoding: 'utf8' });
    assert.equal(other.status, 0, other.stderr);
    assert.match(other.stdout, /^user fallback$/m);
    assert.match(other.stdout, /^port 22$/m);
  }
});

test('creates a private SSH config and validates manual destinations', async t => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'axcor-ssh-create-'));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const config = path.join(home, '.ssh', 'config');
  await assert.rejects(saveSshHost({ alias: 'test\nHost evil', destination: 'host' }, home), /alias/);
  await assert.rejects(saveSshHost({ alias: 'test', destination: 'host\nProxyCommand bad' }, home), /SSH host/);
  await assert.rejects(saveSshHost({ alias: 'test', destination: 'host', port: 0 }, home), /SSH port/);
  await assert.rejects(fs.stat(config), { code: 'ENOENT' });
  assert.deepEqual(splitSshDestination('ubuntu@[2001:db8::1]'), { hostname: '2001:db8::1', user: 'ubuntu' });
  await saveSshHost({ alias: 'test', destination: 'host' }, home);
  assert.equal(await fs.readFile(config, 'utf8'), 'Host test\n  HostName host\n\n');
  assert.equal((await fs.stat(config)).mode & 0o777, 0o600);
});
