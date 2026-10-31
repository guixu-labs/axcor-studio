interface WorkspaceExplorerProps {
  files: string[];
  activeFile: string;
  onSelect: (file: string) => void;
  onSave: () => void;
  onRun: () => void;
}

export function WorkspaceExplorer({ files, activeFile, onSelect, onSave, onRun }: WorkspaceExplorerProps): JSX.Element {
  return <aside className="workspace-explorer">
    <div className="explorer-heading"><div><span className="eyebrow">Workspace</span><h2>Files</h2></div><div><button className="text-button" type="button" onClick={onSave}>Save</button></div></div>
    <div className="file-list">
      {files.map(file => <button className={'file-entry' + (file === activeFile ? ' active' : '')} key={file} type="button" onClick={() => onSelect(file)}>{file}</button>)}
    </div>
    <button className="run-action" type="button" onClick={onRun}><span>Run workflow</span><b>⌘ ↵</b></button>
  </aside>;
}
