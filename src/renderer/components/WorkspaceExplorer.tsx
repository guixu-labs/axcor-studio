import { Fragment, useState } from 'react';
import type { WorkspaceNode } from '../../workspaceFiles';

interface WorkspaceExplorerProps {
  tree: WorkspaceNode[];
  activeFile: string;
  onSelect: (filePath: string) => void;
  onSave: () => void;
  onRun: () => void;
  messages: { files: string; save: string; runWorkflow: string; emptyWorkspace: string };
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

function fileBadge(name: string): string {
  const extension = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : '';
  if (extension === 'md') return '≡';
  if (extension === 'ts' || extension === 'tsx') return 'TS';
  if (extension === 'js' || extension === 'jsx') return 'JS';
  if (extension === 'json') return '{}';
  if (extension === 'py') return 'Py';
  if (extension === 'css') return '#';
  if (extension === 'yml' || extension === 'yaml') return 'Y';
  return '·';
}

export function WorkspaceExplorer({ tree, activeFile, onSelect, onSave, onRun, messages }: WorkspaceExplorerProps): JSX.Element {
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
    const indent = { paddingLeft: 10 + depth * 14 + 'px' };
    if (node.type === 'dir') {
      const isExpanded = expanded.has(node.path);
      return <Fragment key={node.path}>
        <button className={'file-entry file-entry-dir' + (isExpanded ? ' expanded' : '')} style={indent} type="button" onClick={() => toggle(node.path)} aria-expanded={isExpanded}>
          <span className="tree-arrow" aria-hidden="true">{isExpanded ? '▾' : '▸'}</span><span className="tree-name">{node.name}</span>
        </button>
        {isExpanded && node.children.map(child => renderNode(child, depth + 1))}
      </Fragment>;
    }
    return <button className={'file-entry' + (node.path === activeFile ? ' active' : '')} style={indent} key={node.path} type="button" onClick={() => onSelect(node.path)}>
      <span className="tab-file-icon" aria-hidden="true">{fileBadge(node.name)}</span><span className="tree-name">{node.name}</span>
    </button>;
  };

  return <aside className="workspace-explorer">
    <div className="explorer-heading"><div><span className="eyebrow">Workspace</span><h2>{messages.files}</h2></div><div><button className="text-button" type="button" onClick={onSave}>{messages.save}</button></div></div>
    <div className="file-list">
      {roots.length ? roots.map(node => renderNode(node, 0)) : <div className="run-list-empty"><strong>{messages.emptyWorkspace}</strong></div>}
    </div>
    <button className="run-action" type="button" onClick={onRun}><span>{messages.runWorkflow}</span><b>⌘ ↵</b></button>
  </aside>;
}
