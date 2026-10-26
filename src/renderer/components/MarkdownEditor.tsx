interface MarkdownEditorProps {
  file: string;
  content: string;
  onChange: (content: string) => void;
  onSave: () => void;
  onRun: () => void;
}

export function MarkdownEditor({ file, content, onChange, onSave, onRun }: MarkdownEditorProps): JSX.Element {
  return <section className="editor-pane"><div className="pane-title"><h2>Markdown Editor · {file}</h2><div><button onClick={onSave}>Save</button><button onClick={onRun}>Run</button></div></div><textarea value={content} onChange={event => onChange(event.target.value)} spellCheck={false} /></section>;
}
