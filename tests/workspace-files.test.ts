import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { walkWorkspace } from '../src/workspaceFiles';

async function makeFixture(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'wb-tree-'));
  await fs.mkdir(path.join(root, 'src', 'nested'), { recursive: true });
  await fs.mkdir(path.join(root, 'node_modules', 'pkg'), { recursive: true });
  await fs.mkdir(path.join(root, '.git'), { recursive: true });
  await fs.writeFile(path.join(root, 'workflow.md'), '# wf');
  await fs.writeFile(path.join(root, 'a.ts'), 'export const a = 1;');
  await fs.writeFile(path.join(root, 'src', 'main.ts'), '// main');
  await fs.writeFile(path.join(root, 'src', 'nested', 'deep.json'), '{}');
  await fs.writeFile(path.join(root, 'node_modules', 'pkg', 'index.js'), '// skipped');
  await fs.writeFile(path.join(root, '.git', 'config'), '[core]');
  return root;
}

test('walkWorkspace returns the full tree with dirs first and sorted names', async () => {
  const root = await makeFixture();
  const nodes = await walkWorkspace(root);
  const paths = nodes.map(node => node.path);
  assert.ok(paths.includes('workflow.md'));
  assert.ok(paths.includes('a.ts'));
  assert.ok(paths.includes('src'));
  assert.ok(paths.includes('src/main.ts'));
  assert.ok(paths.includes('src/nested/deep.json'));
  assert.ok(!paths.includes('node_modules'));
  assert.ok(!paths.includes('.git'));
  assert.equal(nodes[0].path, 'src');
  assert.equal(nodes[1].path, 'src/nested');
  assert.equal(nodes[2].path, 'src/nested/deep.json');
  await fs.rm(root, { recursive: true, force: true });
});

test('walkWorkspace tolerates a missing root', async () => {
  const nodes = await walkWorkspace('/nonexistent/workspace');
  assert.deepEqual(nodes, []);
});
