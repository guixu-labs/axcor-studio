import { useEffect, useRef } from 'react';
import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/editor/editor.worker?worker';
import { workflowProgramIssues } from '../workflowProgram';

(self as { MonacoEnvironment?: monaco.Environment }).MonacoEnvironment = {
  getWorker: () => new editorWorker(),
};

export interface MonacoEditorMessages {
  markdown: string;
  splitVertical: string;
  splitHorizontal: string;
  workflowWarning: string;
}

interface MonacoEditorProps {
  files: string[];
  activeFile: string;
  content: string;
  onChange: (content: string) => void;
  onSelectFile: (file: string) => void;
  onCloseFile: (file: string) => void;
  splitDirection: 'none' | 'horizontal' | 'vertical';
  onSplit: (direction: 'none' | 'horizontal' | 'vertical') => void;
  showSplitActions?: boolean;
  colorScheme: 'light' | 'dark';
  tokens: Record<string, string>;
  fontFamily: string;
  messages: MonacoEditorMessages;
}

function defineWorkbenchTheme(tokens: Record<string, string>, colorScheme: 'light' | 'dark'): void {
  monaco.editor.defineTheme('workbench', {
    base: colorScheme === 'dark' ? 'vs-dark' : 'vs',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': tokens['surface-0'],
      'editor.foreground': tokens['text'],
      'editor.lineHighlightBackground': colorScheme === 'dark' ? '#ffffff08' : '#00000008',
      'editor.selectionBackground': tokens['accent-soft'],
      'editorCursor.foreground': tokens['accent'],
      'editorLineNumber.foreground': tokens['muted'],
      'editorLineNumber.activeForeground': tokens['text'],
      'editorGutter.background': tokens['surface-0'],
      'editorIndentGuide.background1': tokens['border'],
      'editorWidget.background': tokens['surface-1'],
      'editorWidget.border': tokens['border'],
      'editorSuggestWidget.background': tokens['surface-1'],
      'editorSuggestWidget.border': tokens['border'],
      'editorSuggestWidget.selectedBackground': tokens['accent-soft'],
      'scrollbarSlider.background': colorScheme === 'dark' ? '#ffffff22' : '#00000022',
      'scrollbarSlider.hoverBackground': colorScheme === 'dark' ? '#ffffff33' : '#00000033',
      'focusBorder': tokens['accent'],
      'minimap.background': tokens['surface-0'],
    },
  });
  monaco.editor.setTheme('workbench');
}

export function MonacoEditor({ files, activeFile, content, onChange, onSelectFile, onCloseFile, splitDirection, onSplit, showSplitActions = true, colorScheme, tokens, fontFamily, messages }: MonacoEditorProps): JSX.Element {
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<monaco.editor.IStandaloneCodeEditor>();

  useEffect(() => {
    if (!host.current) return;
    editor.current = monaco.editor.create(host.current, {
      value: content,
      language: 'markdown',
      automaticLayout: true,
      fontFamily,
      fontSize: 13,
      lineHeight: 23,
      wordWrap: 'on',
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      renderLineHighlight: 'line',
    });
    editor.current.onDidChangeModelContent(() => {
      onChange(editor.current?.getValue() ?? '');
    });
    return () => { editor.current?.dispose(); editor.current = undefined; };
  }, []);

  useEffect(() => {
    if (!editor.current || editor.current.getValue() === content) return;
    editor.current.setValue(content);
  }, [content]);

  useEffect(() => {
    if (!editor.current) return;
    defineWorkbenchTheme(tokens, colorScheme);
  }, [colorScheme, tokens]);

  useEffect(() => {
    editor.current?.updateOptions({ fontFamily });
  }, [fontFamily]);

  const issues = workflowProgramIssues(content);

  return <section className="editor-pane">
    <div className="editor-tabs" role="tablist" aria-label="Open files">
      {files.map(file => <div className={'editor-tab' + (file === activeFile ? ' active' : '')} key={file}>
        <button type="button" role="tab" aria-selected={file === activeFile} onClick={() => onSelectFile(file)}><span className="tab-file-icon" aria-hidden="true">≡</span>{file}</button>
        <button className="tab-close" type="button" aria-label={'Close ' + file} onClick={() => onCloseFile(file)}>×</button>
      </div>)}
    </div>
    <div className="editor-toolbar"><h2>{activeFile}</h2><span>{messages.markdown}</span>{issues.error && <span className="frontmatter-warn" role="status" title={issues.error}>{messages.workflowWarning}</span>}{showSplitActions && <div className="editor-actions"><button className="icon-button" type="button" title={messages.splitVertical} aria-label={messages.splitVertical} onClick={() => onSplit(splitDirection === 'vertical' ? 'none' : 'vertical')}><span className="split-vertical-icon" aria-hidden="true" /></button><button className="icon-button" type="button" title={messages.splitHorizontal} aria-label={messages.splitHorizontal} onClick={() => onSplit(splitDirection === 'horizontal' ? 'none' : 'horizontal')}><span className="split-horizontal-icon" aria-hidden="true" /></button></div>}</div>
    <div className="monaco-host" ref={host} />
  </section>;
}
