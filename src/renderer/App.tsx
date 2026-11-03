import { useEffect, useRef, useState } from 'react';
import { MockOpsbotClient } from './services/opsbotClient';
import type { Run, RunEvent } from '../shared/protocol';
import { NavigationRail } from './components/NavigationRail';
import { WorkspaceExplorer } from './components/WorkspaceExplorer';
import { MarkdownEditor } from './components/MarkdownEditor';
import { RunDetail, RunsList } from './components/RunsPanel';
import { ResizeHandle } from './components/ResizeHandle';
import { createEditorGroupLayout, splitEditorGroup } from './workbench/layout';
import type { EditorGroupOrientation } from './workbench/layout';
import { createWorkbenchLayout, toggleWorkbenchPart } from './workbench/layoutService';
import { loadWorkbenchState, saveWorkbenchState } from './workbench/storage';
import { createWorkbenchServices, WorkbenchCommandService } from './workbench/services';
import { SettingsModal } from './components/SettingsModal';
import type { FontId, ThemeId } from './components/SettingsModal';
import { defaultFont, defaultTheme, fonts, themes } from './settings';
import { messages, type LocaleId } from './i18n';

const client = new MockOpsbotClient();

export default function App(): JSX.Element {
  const [workspace, setWorkspace] = useState<string>();
  const [files, setFiles] = useState(['workflow.md']);
  const [openFiles, setOpenFiles] = useState(() => loadWorkbenchState('workbench.openFiles', ['workflow.md']));
  const [file, setFile] = useState(() => loadWorkbenchState('workbench.activeFile', 'workflow.md'));
  const [contents, setContents] = useState<Record<string, string>>({ 'workflow.md': '# New workflow\n\nDescribe the workflow steps here.' });
  const [runs, setRuns] = useState<Run[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string>();
  const [eventsByRun, setEventsByRun] = useState<Record<string, RunEvent[]>>({});
  const selectedRun = runs.find(item => item.id === selectedRunId);
  const selectedEvents = selectedRunId ? eventsByRun[selectedRunId] ?? [] : [];
  const [activeNavigation, setActiveNavigation] = useState('runs');
  const [explorerWidth, setExplorerWidth] = useState(220);
  const [layout, setLayout] = useState(() => loadWorkbenchState('workbench.layout', createWorkbenchLayout()));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeId>(() => loadWorkbenchState('workbench.theme', defaultTheme.id));
  const [font, setFont] = useState<FontId>(() => loadWorkbenchState('workbench.font', defaultFont.id));
  const [locale, setLocale] = useState<LocaleId>(() => loadWorkbenchState('workbench.locale', 'zh-CN'));
  const t = messages[locale];
  const services = useRef(createWorkbenchServices()).current;
  const commands = services.get(WorkbenchCommandService);
  const editorLayout = layout.editorLayout;
  const splitDirection = editorLayout.groups.length > 1 ? editorLayout.orientation : 'none';
  useEffect(() => saveWorkbenchState('workbench.layout', layout), [layout]);
  useEffect(() => saveWorkbenchState('workbench.openFiles', openFiles), [openFiles]);
  useEffect(() => saveWorkbenchState('workbench.activeFile', file), [file]);
  useEffect(() => saveWorkbenchState('workbench.theme', theme), [theme]);
  useEffect(() => saveWorkbenchState('workbench.font', font), [font]);
  useEffect(() => saveWorkbenchState('workbench.locale', locale), [locale]);
  useEffect(() => {
    const selectedTheme = themes.find(item => item.id === theme) ?? defaultTheme;
    const selectedFont = fonts.find(item => item.id === font) ?? defaultFont;
    Object.entries(selectedTheme.tokens).forEach(([name, value]) => document.documentElement.style.setProperty('--theme-' + name, value));
    document.documentElement.style.setProperty('--app-font', selectedFont.family);
    document.documentElement.style.setProperty('color-scheme', selectedTheme.colorScheme);
  }, [font, theme]);
  const splitEditor = (direction: 'none' | 'horizontal' | 'vertical'): void => {
    commands.register('workbench.splitEditor', () => {
      if (direction === 'none') {
        setLayout(previous => ({ ...previous, editorLayout: createEditorGroupLayout() }));
        return;
      }
      setLayout(previous => ({ ...previous, editorLayout: splitEditorGroup(previous.editorLayout, direction as EditorGroupOrientation) }));
    });
    commands.execute('workbench.splitEditor');
  };
  const navigate = (item: string): void => {
    commands.register('workbench.navigate', () => { if (item === 'settings') { setSettingsOpen(true); return; } setActiveNavigation(item); });
    commands.execute('workbench.navigate');
  };

  const content = contents[file] ?? '';
  const chooseWorkspace = async (): Promise<void> => {
    const selected = await window.workbench.chooseWorkspace();
    if (!selected) return;
    const workspaceFiles = await window.workbench.listMarkdownFiles();
    const initialFile = workspaceFiles[0] ?? 'workflow.md';
    setWorkspace(selected);
    setFiles(workspaceFiles.length ? workspaceFiles : ['workflow.md']);
    setOpenFiles([initialFile]);
    setFile(initialFile);
    if (workspaceFiles[0]) {
      const initialContent = await window.workbench.readFile(initialFile);
      setContents(previous => ({ ...previous, [initialFile]: initialContent }));
    }
  };
  const selectFile = async (nextFile: string): Promise<void> => {
    setFile(nextFile);
    setOpenFiles(previous => previous.includes(nextFile) ? previous : [...previous, nextFile]);
    if (workspace && !Object.prototype.hasOwnProperty.call(contents, nextFile)) {
      const nextContent = await window.workbench.readFile(nextFile);
      setContents(previous => ({ ...previous, [nextFile]: nextContent }));
    }
  };
  const save = async (): Promise<void> => { if (workspace) await window.workbench.writeFile(file, content); };
  const startRun = async (): Promise<void> => {
    const created = await client.createRun({ workflowId: file, workspacePath: workspace, content });
    setRuns(previous => [created, ...previous]);
    setSelectedRunId(created.id);
    setEventsByRun(previous => ({ ...previous, [created.id]: [] }));
    setActiveNavigation('runs');
    setLayout(previous => previous.sidebarVisible ? previous : toggleWorkbenchPart(previous, 'sidebar'));
    client.subscribeRunEvents(created.id, event => {
      setEventsByRun(previous => ({ ...previous, [created.id]: [...(previous[created.id] ?? []), event] }));
      void client.getRun(created.id).then(latest => setRuns(previous => previous.map(item => item.id === latest.id ? latest : item)));
    });
  };
  const closeFile = (closedFile: string): void => {
    if (openFiles.length === 1) return;
    const nextFiles = openFiles.filter(openFile => openFile !== closedFile);
    setOpenFiles(nextFiles);
    if (file === closedFile) setFile(nextFiles[nextFiles.length - 1]);
  };
  const cancelRun = async (): Promise<void> => {
    if (!selectedRun) return;
    await client.cancelRun(selectedRun.id);
    const latest = await client.getRun(selectedRun.id);
    setRuns(previous => previous.map(item => item.id === latest.id ? latest : item));
  };

  const showSidebar = layout.sidebarVisible && (activeNavigation === 'workbench' || activeNavigation === 'runs');
  const leftWorkbenchWidth = (showSidebar ? 52 + explorerWidth + 4 : 52) + 6;
  return <main className="app-shell" style={{ gridTemplateColumns: leftWorkbenchWidth + 'px minmax(0, 1fr)' }}>
      <header className="topbar">
      <div className="topbar-brand" aria-label={t.brand}><span className="brand-mark">A</span><span className="brand-name">{t.brand}</span></div>
        <div className="topbar-navigation">
          <button className="icon-button" type="button" aria-label={t.back} title={t.back}>‹</button>
          <button className="icon-button" type="button" aria-label={t.forward} title={t.forward}>›</button>
          <button className="quick-search" type="button">{t.search}</button>
        </div>
        <div className="topbar-actions">
          <button className="icon-button" type="button" onClick={chooseWorkspace} aria-label={t.openWorkspace} title={t.openWorkspace}>＋</button>
          <button className="icon-button" type="button" onClick={() => setLayout(previous => toggleWorkbenchPart(previous, 'sidebar'))} aria-label={t.toggleSidebar} title={t.toggleSidebar}><span className="sidebar-toggle-icon" aria-hidden="true" /></button>
          <span className="workspace-pill"><i aria-hidden="true" />{workspace ?? t.noWorkspace}</span>
        </div>
      </header>
    <div className="left-workbench" style={{ gridTemplateColumns: showSidebar ? '52px minmax(0, 1fr) 4px' : '52px' }}>
      <NavigationRail active={settingsOpen ? 'settings' : activeNavigation} onSelect={navigate} messages={t} />
      {showSidebar && activeNavigation === 'workbench' && <WorkspaceExplorer files={files} activeFile={file} onSelect={selectFile} onSave={save} onRun={startRun} messages={t} />}
      {showSidebar && activeNavigation === 'runs' && <RunsList runs={runs} selectedRunId={selectedRunId} onSelectRun={setSelectedRunId} onRun={startRun} messages={t} />}
      {showSidebar && <ResizeHandle direction="horizontal" onResize={delta => setExplorerWidth(Math.max(180, Math.min(360, explorerWidth + delta)))} />}
    </div>
    <div className="app-content">
      <div className="workbench-body">
        <div className="workbench-main" style={{ gridTemplateRows: 'minmax(0, 1fr)' }}>
          {activeNavigation === 'workbench' && <section className="workspace-grid">
            <div className={'editor-groups split-' + splitDirection}>
              <MarkdownEditor files={openFiles} activeFile={file} content={content} onChange={nextContent => setContents(previous => ({ ...previous, [file]: nextContent }))} onSelectFile={selectFile} onCloseFile={closeFile} splitDirection={splitDirection} onSplit={splitEditor} messages={t} />
              {splitDirection !== 'none' && <MarkdownEditor files={openFiles} activeFile={file} content={content} onChange={nextContent => setContents(previous => ({ ...previous, [file]: nextContent }))} onSelectFile={selectFile} onCloseFile={closeFile} splitDirection={splitDirection} onSplit={splitEditor} showSplitActions={false} messages={t} />}
            </div>
          </section>}
          {activeNavigation === 'runs' && (selectedRun
            ? <section className="single-panel"><RunDetail run={selectedRun} events={selectedEvents} onCancel={cancelRun} messages={t} /></section>
            : <section className="single-panel"><section className="run-detail"><div className="empty-state"><span className="empty-icon">▶</span><strong>{t.selectRun}</strong><p>{t.selectRunHint}</p></div></section></section>)}
        </div>
      </div>
    </div>
    <footer className="status-bar"><span className="status-live"><i aria-hidden="true" />{workspace ? t.workspaceReady : t.noWorkspace}</span><span>{file}</span><span>UTF-8</span><span>LF</span><span>{t.markdown}</span></footer>
    {settingsOpen && <SettingsModal theme={theme} font={font} locale={locale} onThemeChange={setTheme} onFontChange={setFont} onLocaleChange={setLocale} onClose={() => setSettingsOpen(false)} messages={t} />}
  </main>;
}
