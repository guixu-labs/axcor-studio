interface WorkspaceExplorerProps {
  file: string;
  onSelect: (file: string) => void;
}

export function WorkspaceExplorer({ file, onSelect }: WorkspaceExplorerProps): JSX.Element {
  return <aside><h2>Workflows</h2><button className="file-entry" onClick={() => onSelect(file)}>{file}</button></aside>;
}
