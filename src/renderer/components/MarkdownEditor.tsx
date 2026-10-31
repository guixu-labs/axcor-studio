interface MarkdownEditorProps {
  files: string[];
  activeFile: string;
  content: string;
  onChange: (content: string) => void;
  onSelectFile: (file: string) => void;
  onCloseFile: (file: string) => void;
  splitDirection: 'none' | 'horizontal' | 'vertical';
  onSplit: (direction: 'none' | 'horizontal' | 'vertical') => void;
  showSplitActions?: boolean;
}

export function MarkdownEditor({ files, activeFile, content, onChange, onSelectFile, onCloseFile, splitDirection, onSplit, showSplitActions = true }: MarkdownEditorProps): JSX.Element {
  return <section className="editor-pane">
    <div className="editor-tabs" role="tablist" aria-label="Open files">
      {files.map(file => <div className={'editor-tab' + (file === activeFile ? ' active' : '')} key={file}>
        <button type="button" role="tab" aria-selected={file === activeFile} onClick={() => onSelectFile(file)}><span className="tab-file-icon" aria-hidden="true">≡</span>{file}</button>
        <button className="tab-close" type="button" aria-label={'Close ' + file} onClick={() => onCloseFile(file)}>×</button>
      </div>)}
    </div>
    <div className="editor-toolbar"><h2>{activeFile}</h2><span>Markdown</span>{showSplitActions && <div className="editor-actions"><button className="icon-button" type="button" title="Split editor left or right" aria-label="Split editor left or right" onClick={() => onSplit(splitDirection === 'vertical' ? 'none' : 'vertical')}>◫</button><button className="icon-button" type="button" title="Split editor up or down" aria-label="Split editor up or down" onClick={() => onSplit(splitDirection === 'horizontal' ? 'none' : 'horizontal')}>▤</button></div>}</div>
    <textarea value={content} onChange={event => onChange(event.target.value)} spellCheck={false} />
  </section>;
}
