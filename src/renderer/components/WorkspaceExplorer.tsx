interface WorkspaceExplorerProps {
  files: string[];
  activeFile: string;
  onSelect: (file: string) => void;
  onSave: () => void;
  onRun: () => void;
  messages: { files: string; save: string; runWorkflow: string };
}

export function WorkspaceExplorer({ files, activeFile, onSelect, onSave, onRun, messages }: WorkspaceExplorerProps): JSX.Element {
  return <aside className="workspace-explorer">
    <div className="explorer-heading"><div><span className="eyebrow">Workspace</span><h2>{messages.files}</h2></div><div><button className="text-button" type="button" onClick={onSave}>{messages.save}</button></div></div>
    <div className="file-list">
      {files.map(file => <button className={'file-entry' + (file === activeFile ? ' active' : '')} key={file} type="button" onClick={() => onSelect(file)}>{file}</button>)}
    </div>
    <button className="run-action" type="button" onClick={onRun}><span>{messages.runWorkflow}</span><b>⌘ ↵</b></button>
  </aside>;
}
