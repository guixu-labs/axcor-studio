import fs from 'node:fs/promises';
import path from 'node:path';

export interface WorkspaceNode {
  name: string;
  path: string;
  type: 'dir' | 'file';
}

const SKIPPED_DIRECTORIES = new Set(['node_modules', '.git', '.vite', 'out', 'dist', '.next', '.opsbot', '.claude', '__pycache__', '.venv']);
const MAX_DEPTH = 16;
const MAX_NODES = 10_000;

export async function walkWorkspace(root: string): Promise<WorkspaceNode[]> {
  const nodes: WorkspaceNode[] = [];
  let nodeCount = 0;

  const walk = async (dir: string, depth: number): Promise<void> => {
    if (depth > MAX_DEPTH || nodeCount >= MAX_NODES) return;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const entry of entries) {
      if (nodeCount >= MAX_NODES) return;
      const absolute = path.join(dir, entry.name);
      const relative = path.relative(root, absolute).split(path.sep).join('/');
      if (entry.isDirectory()) {
        if (SKIPPED_DIRECTORIES.has(entry.name) || entry.name.startsWith('.')) continue;
        nodes.push({ name: entry.name, path: relative, type: 'dir' });
        nodeCount += 1;
        await walk(absolute, depth + 1);
      } else if (entry.isFile()) {
        nodes.push({ name: entry.name, path: relative, type: 'file' });
        nodeCount += 1;
      }
    }
  };

  await walk(root, 0);
  return nodes;
}
