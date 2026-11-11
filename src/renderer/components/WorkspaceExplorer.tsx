import { Fragment, useState } from 'react';
import type { WorkspaceNode } from '../../workspaceFiles';

interface WorkspaceExplorerProps {
  tree: WorkspaceNode[];
  hasWorkspace: boolean;
  onOpenWorkspace: () => void;
  activeFile: string;
  onSelect: (filePath: string) => void;
  onSave: () => void;
  messages: { workspace: string; save: string; emptyWorkspace: string; noWorkspace: string; openWorkspace: string };
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

const EXTENSION_BADGES: Record<string, { label: string; className: string }> = {
  md: { label: 'MD', className: 'badge-md' },
  ts: { label: 'TS', className: 'badge-ts' },
  tsx: { label: 'TS', className: 'badge-ts' },
  js: { label: 'JS', className: 'badge-js' },
  jsx: { label: 'JS', className: 'badge-js' },
  json: { label: '{}', className: 'badge-json' },
  py: { label: 'PY', className: 'badge-py' },
  css: { label: '#', className: 'badge-css' },
  html: { label: '<>', className: 'badge-html' },
  yml: { label: 'Y', className: 'badge-yml' },
  yaml: { label: 'Y', className: 'badge-yml' },
  sh: { label: '$', className: 'badge-sh' },
};

function extensionBadge(name: string): { label: string; className: string } {
  const extension = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : '';
  return EXTENSION_BADGES[extension] ?? { label: '·', className: 'badge-plain' };
}

const INDENT_GUIDE = 'linear-gradient(to right, transparent 7px, var(--border) 7px, var(--border) 8px, transparent 8px)';

export function WorkspaceExplorer({ tree, hasWorkspace, activeFile, onSelect, onSave, onOpenWorkspace, messages }: WorkspaceExplorerProps): JSX.Element {
  const roots = buildTree(tree);
  const topLevelDirs = new Set(roots.filter(node => node.type === 'dir').map(node => node.path));
  const [expanded, setExpanded] = useState<Set<string>>(topLevelDirs);

  const toggle = (path: string): void => {
    setExpanded(previous => {
      const next = new Set(previous);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  };

  const renderNode = (node: TreeNode, depth: number): JSX.Element => {
    const style: React.CSSProperties = {
      paddingLeft: 10 + depth * 14,
      ...(depth > 0 ? { backgroundImage: INDENT_GUIDE, backgroundPosition: `${depth * 14 - 7}px 0`, backgroundRepeat: 'no-repeat' } : {}),
    };
    if (node.type === 'dir') {
      const isExpanded = expanded.has(node.path);
      return <Fragment key={node.path}>
        <button className={'file-entry file-entry-dir' + (isExpanded ? ' expanded' : '')} style={style} type="button" onClick={() => toggle(node.path)} aria-expanded={isExpanded}>
          <span className={isExpanded ? 'tree-folder-open' : 'tree-folder'} aria-hidden="true" /><span className="tree-name">{node.name}</span>
        </button>
        {isExpanded && node.children.map(child => renderNode(child, depth + 1))}
      </Fragment>;
    }
    const badge = extensionBadge(node.name);
    return <button className={'file-entry' + (node.path === activeFile ? ' active' : '')} style={style} key={node.path} type="button" onClick={() => onSelect(node.path)}>
      <span className={'file-badge ' + badge.className} aria-hidden="true">{badge.label}</span><span className="tree-name">{node.name}</span>
    </button>;
  };

  return <aside className="workspace-explorer">
    <div className="explorer-heading">
      <h2>{messages.workspace}</h2>
      {roots.length > 0 && <div className="explorer-actions">
        {activeFile && <button className="text-button" type="button" onClick={onSave}>{messages.save}</button>}
        <button className="text-button" type="button" aria-label={messages.openWorkspace} title={messages.openWorkspace} onClick={onOpenWorkspace}>
          <span className="tree-folder" aria-hidden="true" />
        </button>
      </div>}
    </div>
    <div className="file-list">
      {roots.length ? roots.map(node => renderNode(node, 0)) : <div className="workspace-empty">
        <p>{hasWorkspace ? messages.emptyWorkspace : messages.noWorkspace}</p>
        <button className="workspace-open-button" type="button" onClick={onOpenWorkspace}>{messages.openWorkspace}</button>
      </div>}
    </div>
  </aside>;
}
