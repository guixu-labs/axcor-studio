import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { chmod, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { once } from 'node:events';
import { test } from 'node:test';
import { validateRemoteConfig } from '../src/sshWorkspace';

test('validates SSH config without allowing option injection or ambiguous paths', () => {
  assert.deepEqual(validateRemoteConfig({ host: 'me@dev-server', root: '/home/me/my project/', controllerPort: 18600 }),
    { host: 'me@dev-server', root: '/home/me/my project', controllerPort: 18600 });
  for (const host of ['-F', 'dev;echo bad', '']) {
    assert.throws(() => validateRemoteConfig({ host, root: '/workspace', controllerPort: 18600 }), /SSH host/);
  }
  assert.throws(() => validateRemoteConfig({ host: 'dev', root: '/home/../etc', controllerPort: 18600 }), /directory/);
  assert.throws(() => validateRemoteConfig({ host: 'dev', root: '/workspace', controllerPort: 70000 }), /port/);
});

const pythonAvailable = process.platform !== 'win32' && spawnSync('python3', ['--version']).status === 0;
test('remote helper lists files, saves atomically, detects conflicts and rejects symlinks', { skip: !pythonAvailable }, async () => {
  const scratch = await mkdtemp(path.join(await realpath(tmpdir()), 'axcor-helper-'));
  const file = path.join(scratch, 'workflow.yml');
  await writeFile(file, 'original');
  await symlink(file, path.join(scratch, 'alias.yml'));
  const process = spawn('python3', ['remote/axcor-workspace-helper', '--stdio'], { stdio: ['pipe', 'pipe', 'inherit'] });
  const exited = once(process, 'exit');
  const replies = createInterface({ input: process.stdout, crlfDelay: Infinity })[Symbol.asyncIterator]();
  const request = async (action: string, params: Record<string, unknown> = {}) => {
    process.stdin.write(JSON.stringify({ action, ...params }) + '\n');
    const response = await replies.next();
    assert.equal(response.done, false);
    return JSON.parse(response.value);
  };
  try {
    assert.deepEqual(await request('open', { root: scratch }), { value: scratch });
    assert.deepEqual((await request('list')).value, [{ name: 'workflow.yml', path: 'workflow.yml', type: 'file' }]);
    const { value: original } = await request('read', { path: 'workflow.yml' });
    assert.equal(original.content, 'original');
    const { value: saved } = await request('write', { path: 'workflow.yml', content: '新内容', version: original.version });
    assert.equal(await readFile(file, 'utf8'), '新内容');
    assert.notEqual(saved.version, original.version);
    assert.equal((await request('read', { path: 'workflow.yml' })).value.version, saved.version);
    if (globalThis.process.getuid?.() !== 0) {
      await chmod(file, 0o444);
      const readonly = (await request('read', { path: 'workflow.yml' })).value;
      assert.match((await request('write', { path: 'workflow.yml', content: 'draft', version: readonly.version })).error, /Permission denied/);
      await chmod(file, 0o644);
    }
    await writeFile(file, 'external edit');
    assert.match((await request('write', { path: 'workflow.yml', content: 'draft', version: saved.version })).error, /changed/);
    assert.equal(await readFile(file, 'utf8'), 'external edit');
    for (const invalid of ['../workflow.yml', 'alias.yml', '/etc/passwd']) {
      assert.ok((await request('program', { path: invalid })).error);
      assert.ok((await request('read', { path: invalid })).error);
    }
    assert.deepEqual(await request('program', { path: 'workflow.yml' }), { value: file });
  } finally {
    process.stdin.end();
    await exited;
    await rm(scratch, { recursive: true, force: true });
  }
});
