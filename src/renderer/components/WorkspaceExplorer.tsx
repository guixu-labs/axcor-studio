import { Fragment, useMemo, useState } from 'react';
import type { WorkspaceNode } from '../../workspaceFiles';

interface WorkspaceExplorerProps {
  tree: WorkspaceNode[];
  hasWorkspace: boolean;
  workspacePath?: string;
  activeFile: string;
  onSelect: (filePath: string) => void;
  onExpand?: (directory: string) => void;
  syncLabel: string;
  onSync?: () => void;
  messages: { workspace: string; emptyWorkspace: string; noWorkspace: string };
}

interface TreeNode {
  name: string;
  path: string;
  type: 'dir' | 'file';
  children: TreeNode[];
}

function buildTree(nodes: WorkspaceNode[]): TreeNode[] {
  const roots: TreeNode[] = [];
  const byPath = new Map<string, TreeNode>();
  for (const node of nodes) {
    const entry: TreeNode = { name: node.name, path: node.path, type: node.type, children: [] };
    byPath.set(node.path, entry);
    const slash = node.path.lastIndexOf('/');
    if (slash === -1) {
      roots.push(entry);
    } else {
      const parent = byPath.get(node.path.slice(0, slash));
      if (parent) parent.children.push(entry);
      else roots.push(entry);
    }
  }
  return roots;
}

// Glyphs from the Codicon font shipped with Monaco.
const FILE_ICONS = [
  { extensions: ['md', 'mdx'], glyph: '\ueb1d', tone: 'blue' },
  { extensions: ['sh', 'bash', 'zsh', 'fish', 'ps1'], glyph: '\uea85', tone: 'green' },
  { extensions: ['service', 'timer', 'conf', 'ini', 'toml', 'yaml', 'yml'], glyph: '\ueaf8', tone: 'purple' },
  { extensions: ['json', 'jsonc', 'jsonl'], glyph: '\ueb0f', tone: 'amber' },
  { extensions: ['ts', 'tsx', 'py', 'go', 'rs', 'java', 'cpp', 'c'], glyph: '\ueae9', tone: 'blue' },
  { extensions: ['js', 'jsx', 'mjs', 'cjs', 'html', 'xml'], glyph: '\ueae9', tone: 'amber' },
  { extensions: ['css', 'scss', 'less'], glyph: '\ueb5c', tone: 'purple' },
  { extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'], glyph: '\ueaea', tone: 'purple' },
  { extensions: ['zip', 'tar', 'gz', 'xz', '7z'], glyph: '\ueaef', tone: 'amber' },
  { extensions: ['txt', 'log'], glyph: '\uec5e', tone: 'muted' },
];
const DEFAULT_FILE_ICON = { glyph: '\uea7b', tone: 'muted' };

export function WorkspaceExplorer({ tree, hasWorkspace, activeFile, onSelect, onExpand, onSync, syncLabel, workspacePath, messages }: WorkspaceExplorerProps): JSX.Element {
  const roots = useMemo(() => buildTree(tree), [tree]);
  const topLevelDirs = new Set(roots.filter(node => node.type === 'dir').map(node => node.path));
  const [expanded, setExpanded] = useState<Set<string>>(() => onExpand ? new Set() : topLevelDirs);

  const toggle = (path: string): void => {
    if (!expanded.has(path)) onExpand?.(path);
    setExpanded(previous => {
      const next = new Set(previous);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  };

  const renderNode = (node: TreeNode, depth: number): JSX.Element => {
    const style = { '--tree-depth': depth } as React.CSSProperties;
    if (node.type === 'dir') {
      const isExpanded = expanded.has(node.path);
      return <Fragment key={node.path}>
        <button className="file-entry file-entry-dir" style={style} type="button" onClick={() => toggle(node.path)} aria-expanded={isExpanded} title={node.path}>
          <span className="workspace-glyph tree-disclosure" aria-hidden="true">{isExpanded ? '\ueab4' : '\ueab6'}</span>
          <span className="workspace-glyph tree-icon" data-tone="folder" aria-hidden="true">{isExpanded ? '\ueaf7' : '\uea83'}</span>
          <span className="tree-name">{node.name}</span>
        </button>
        {isExpanded && node.children.map(child => renderNode(child, depth + 1))}
      </Fragment>;
    }
    const extension = node.name.split('.').at(-1)?.toLowerCase() ?? '';
    const icon = FILE_ICONS.find(item => item.extensions.includes(extension)) ?? DEFAULT_FILE_ICON;
    return <button className={'file-entry' + (node.path === activeFile ? ' active' : '')} style={style} key={node.path} type="button" title={node.path} onClick={() => onSelect(node.path)}>
      <span className="workspace-glyph tree-icon" data-tone={icon.tone} aria-hidden="true">{icon.glyph}</span>
      <span className="tree-name">{node.name}</span>
    </button>;
  };

  return <aside className="workspace-explorer">
    <div className="explorer-heading">
      <h2>{messages.workspace}</h2>
      {onSync && <button className="icon-button explorer-sync" type="button" onClick={onSync} aria-label={syncLabel} title={syncLabel}>
        <span className="workspace-glyph" aria-hidden="true">&#xeb37;</span>
      </button>}
    </div>
    {roots.length === 0 && <div className="workspace-empty">
      <p>{hasWorkspace ? messages.emptyWorkspace : messages.noWorkspace}</p>
    </div>}
    {workspacePath && <p className="explorer-workspace-path" title={workspacePath}>{workspacePath}</p>}
    {roots.length > 0 && <div className="file-list">{roots.map(node => renderNode(node, 0))}</div>}
  </aside>;
}
