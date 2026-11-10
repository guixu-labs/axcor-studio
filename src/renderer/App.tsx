import { useEffect, useRef, useState } from 'react';
import { WorkbenchExecutionClient } from './services/executionClient';
import type { SessionModelOption } from '../shared/executionBackendIpc';
import { DEFAULT_EXECUTION_BACKEND_URL } from '../shared/executionBackendConfig';
import type { Run, RunEvent, RuntimeId } from '../shared/protocol';
import { isTerminalRun, runEventKey } from '../shared/run';
import type { RunParamsRow } from './components/RunsPanel';
import type { WorkspaceNode } from '../workspaceFiles';
import { NavigationRail } from './components/NavigationRail';
import { WorkspaceExplorer } from './components/WorkspaceExplorer';
import { MonacoEditor } from './components/MonacoEditor';
import { RunDetail } from './components/RunDetail';
import { RunsList } from './components/RunsPanel';
import { ResizeHandle } from './components/ResizeHandle';
import { createEditorGroupLayout, splitEditorGroup } from './workbench/layout';
import type { EditorGroupOrientation } from './workbench/layout';
import { createWorkbenchLayout, toggleWorkbenchPart } from './workbench/layoutService';
import { loadWorkbenchState, saveWorkbenchState } from './workbench/storage';
import { createWorkbenchServices, WorkbenchCommandService } from './workbench/services';
import { SettingsModal } from './components/SettingsModal';
import type { FontId, ThemeId } from './components/SettingsModal';
import { defaultFont, defaultTheme, fonts, migrateLegacyThemeId, themes } from './settings';
import { messages, type LocaleId } from './i18n';
import { workflowProgramIssues } from './workflowProgram';

const client = new WorkbenchExecutionClient();
const EXECUTION_BACKEND_URL_STORAGE_KEY = 'workbench.executionBackendUrl';

export default function App(): JSX.Element {
  const [workspace, setWorkspace] = useState<string>();
  const workspaceRequiredDialog = useRef<HTMLDialogElement>(null);
  const [tree, setTree] = useState<WorkspaceNode[]>([]);
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
  const [theme, setTheme] = useState<ThemeId>(() => migrateLegacyThemeId(loadWorkbenchState('workbench.theme', defaultTheme.id)));
  const [font, setFont] = useState<FontId>(() => loadWorkbenchState('workbench.font', defaultFont.id));
  const [locale, setLocale] = useState<LocaleId>(() => loadWorkbenchState('workbench.locale', 'zh-CN'));
  const [backgroundImage, setBackgroundImage] = useState(() => loadWorkbenchState('workbench.backgroundImage', ''));
  const [backgroundFit, setBackgroundFit] = useState<'cover' | 'contain'>(() => loadWorkbenchState<'cover' | 'contain'>('workbench.backgroundFit', 'cover'));
  const [executionBackendUrl, setExecutionBackendUrl] = useState<string | undefined>(() =>
    loadWorkbenchState<string | undefined>(EXECUTION_BACKEND_URL_STORAGE_KEY, undefined)
    ?? loadWorkbenchState<string | undefined>('workbench.opsbotUrl', undefined));
  const [executionError, setExecutionError] = useState<string>();
  const [runtime, setRuntime] = useState<RuntimeId>(() => {
    const stored = loadWorkbenchState<string>('workbench.runtime', 'workflow');
    return stored === 'session' || stored === 'opsbot-session' ? 'session' : 'workflow';
  });
  const [runLabel, setRunLabel] = useState('');
  const [runParams, setRunParams] = useState<RunParamsRow[]>([]);
  const [maxParallel, setMaxParallel] = useState('');
  const [runPrompt, setRunPrompt] = useState('');
  const [sessionPrompt, setSessionPrompt] = useState('');
  const [sessionRuntime, setSessionRuntime] = useState('claude_sdk');
  const [sessionModel, setSessionModel] = useState('');
  const [sessionModels, setSessionModels] = useState<SessionModelOption[] | 'loading' | 'unavailable'>('loading');
  const [sessionSystemPrompt, setSessionSystemPrompt] = useState('');
  const [sessionMaxIterations, setSessionMaxIterations] = useState('');
  const [sessionReviewerEnabled, setSessionReviewerEnabled] = useState(false);
  const [insightPath, setInsightPath] = useState('/insight/');
  const [insightFailed, setInsightFailed] = useState(false);
  const effectiveExecutionBackendUrl = executionBackendUrl ?? DEFAULT_EXECUTION_BACKEND_URL;
  const appContent = useRef<HTMLDivElement>(null);
  const importedToInsight = useRef(new Set<string>());
  const t = messages[locale];
  const sessionModelOptions = Array.isArray(sessionModels) ? sessionModels : [];
  const selectedSessionModel = sessionModelOptions.find(option => option.model === sessionModel);
  const sessionModelPlaceholder = sessionModels === 'loading' ? t.sessionModelsLoading
    : sessionModels === 'unavailable' ? t.sessionModelsUnavailable
    : sessionModelOptions.length ? t.sessionSelectModel : t.sessionModelsEmpty;
  const selectedTheme = themes.find(item => item.id === theme) ?? defaultTheme;
  const selectedFont = fonts.find(item => item.id === font) ?? defaultFont;
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
  const bootListRuns = async (): Promise<void> => {
    // The backend may still be starting up; retry for a while before
    // surfacing a connection error.
    for (let attempt = 0; attempt < 6; attempt += 1) {
      try {
        setRuns(await client.listRuns());
        setExecutionError(undefined);
        return;
      } catch (error) {
        if (attempt === 5) setExecutionError(error instanceof Error ? error.message : String(error));
        else await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  };
  useEffect(() => {
    void window.executionBackend.setBaseUrl(executionBackendUrl ?? '');
    void window.workbench.getWorkspace().then(current => {
      if (!current) return;
      setWorkspace(current);
      return loadWorkspaceTree();
    }).catch(() => {});
    void bootListRuns();
  }, []);
  useEffect(() => {
    if (runtime !== 'session' || activeNavigation !== 'runs' || settingsOpen) return;
    let cancelled = false;
    setSessionModels('loading');
    void (async () => {
      try {
        const options = await window.executionBackend.listSessionModels(sessionRuntime);
        if (cancelled) return;
        setSessionModels(options);
        setSessionModel(current => options.some(option => option.model === current) ? current : '');
      } catch {
        if (cancelled) return;
        setSessionModels('unavailable');
        setSessionModel('');
      }
    })();
    return () => { cancelled = true; };
  }, [runtime, sessionRuntime, activeNavigation, settingsOpen, executionBackendUrl]);
  useEffect(() => {
    if (!selectedRunId) return;
    let pending: RunEvent[] = [];
    let timer: ReturnType<typeof setTimeout> | undefined;
    let active = true;
    let refreshVersion = 0;
    const flushEvents = (): void => {
      const batch = pending;
      pending = [];
      if (!batch.length) return;
      setEventsByRun(previous => {
        const current = previous[selectedRunId] ?? [];
        const combined = new Map(current.map(event => [runEventKey(event), event]));
        for (const event of batch) combined.set(runEventKey(event), event);
        if (combined.size === current.length) return previous;
        return { ...previous, [selectedRunId]: [...combined.values()].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)) };
      });
    };
    const refreshRun = (): void => {
      const version = ++refreshVersion;
      void client.getRun(selectedRunId).then(async latest => {
        if (!active || version !== refreshVersion) return;
        setRuns(previous => previous.map(item => item.id === latest.id ? latest : item));
        if (isTerminalRun(latest) && !importedToInsight.current.has(latest.id)) {
          importedToInsight.current.add(latest.id);
          try {
            if (latest.runtimeId === 'session') {
              await window.executionBackend.importToInsight(latest.id);
            } else {
              const sessions = await window.executionBackend.getRunSessions(latest.id);
              for (const session of sessions) await window.executionBackend.importToInsight(session.session_id);
            }
          } catch {
            // Observability import is best-effort; the run view stays usable.
          }
        }
      }).catch(() => { /* A subsequent poll will retry. */ });
    };
    const unsubscribe = client.subscribeRunEvents(selectedRunId, event => {
      pending.push(event);
      timer ??= setTimeout(() => {
        timer = undefined;
        flushEvents();
        refreshRun();
      }, 150);
    });
    return () => {
      active = false;
      unsubscribe();
      clearTimeout(timer);
      flushEvents();
    };
  }, [selectedRunId]);
  useEffect(() => {
    if (activeNavigation !== 'insight') { void window.insight.hide(); return; }
    setInsightFailed(false);
    const node = appContent.current;
    if (!node) return;
    const push = (): void => {
      const rect = node.getBoundingClientRect();
      void window.insight.show(insightPath, { x: rect.left, y: rect.top, width: rect.width, height: rect.height }, selectedTheme.colorScheme === 'dark');
    };
    push();
    const observer = new ResizeObserver(push);
    observer.observe(node);
    return () => observer.disconnect();
  }, [activeNavigation, insightPath, selectedTheme.colorScheme]);
  useEffect(() => window.insight.onLoadFailed(() => setInsightFailed(true)), []);
  useEffect(() => {
    Object.entries(selectedTheme.tokens).forEach(([name, value]) => document.documentElement.style.setProperty('--theme-' + name, value));
    document.documentElement.style.setProperty('--app-font', selectedFont.family);
    document.documentElement.style.setProperty('color-scheme', selectedTheme.colorScheme);
    document.documentElement.style.setProperty('--empty-background-image', backgroundImage ? `url("${backgroundImage}")` : 'none');
    document.documentElement.style.setProperty('--empty-background-size', backgroundFit);
  }, [backgroundFit, backgroundImage, selectedFont, selectedTheme]);
  useEffect(() => saveWorkbenchState('workbench.backgroundImage', backgroundImage), [backgroundImage]);
  useEffect(() => saveWorkbenchState('workbench.backgroundFit', backgroundFit), [backgroundFit]);
  useEffect(() => saveWorkbenchState('workbench.runtime', runtime), [runtime]);
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
    commands.register('workbench.navigate', () => {
      if (item === 'settings') { setSettingsOpen(true); return; }
      if (item === 'insight') { setInsightPath('/insight/'); setInsightFailed(false); }
      setActiveNavigation(item);
    });
    commands.execute('workbench.navigate');
  };

  const content = contents[file] ?? '';
  const loadWorkspaceTree = async (): Promise<void> => {
    const workspaceTree = await window.workbench.listTree();
    setTree(workspaceTree);
    const firstMarkdown = workspaceTree.find(node => node.type === 'file' && node.name.endsWith('.md'));
    const initialFile = firstMarkdown?.path ?? workspaceTree.find(node => node.type === 'file')?.path ?? '';
    setOpenFiles(initialFile ? [initialFile] : []);
    setFile(initialFile);
    if (initialFile) {
      const initialContent = await window.workbench.readFile(initialFile);
      setContents(previous => ({ ...previous, [initialFile]: initialContent }));
    }
  };
  const chooseWorkspace = async (): Promise<void> => {
    const selected = await window.workbench.chooseWorkspace();
    if (!selected) return;
    setWorkspace(selected);
    await loadWorkspaceTree();
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
  const changeSessionRuntime = (value: string): void => {
    setSessionRuntime(value);
    setSessionModel('');
    setSessionModels('loading');
  };
  const startRun = async (): Promise<void> => {
    if (!workspace) { workspaceRequiredDialog.current?.showModal(); return; }
    setExecutionError(undefined);
    let created: Run;
    try {
      if (runtime === 'session') {
        if (!sessionPrompt.trim()) { setExecutionError('会话模式需要填写提示词'); return; }
        if (!selectedSessionModel) { setExecutionError(sessionModelPlaceholder); return; }
        const parsedMaxIterations = Number.parseInt(sessionMaxIterations, 10);
        created = await client.createRun({
          workflowId: '',
          workspacePath: workspace,
          runtime,
          prompt: sessionPrompt,
          sessionRuntime,
          model: selectedSessionModel.model,
          providerIndex: selectedSessionModel.providerIndex,
          ...(sessionSystemPrompt.trim() ? { systemPrompt: sessionSystemPrompt.trim() } : {}),
          ...(Number.isInteger(parsedMaxIterations) && parsedMaxIterations >= 1 ? { maxIterations: parsedMaxIterations } : {}),
          reviewerEnabled: sessionReviewerEnabled,
        });
      } else {
        if (!file) { setExecutionError('没有打开的工作流文件'); return; }
        const issues = workflowProgramIssues(content);
        if (issues.error) { setExecutionError(issues.error); return; }
        await save();
        const params: Record<string, string> = {};
        for (const row of runParams) if (row.key.trim()) params[row.key.trim()] = row.value;
        const parsedMaxParallel = Number.parseInt(maxParallel, 10);
        created = await client.createRun({
          workflowId: file,
          workspacePath: workspace,
          content,
          runtime,
          label: runLabel.trim() || file,
          ...(Object.keys(params).length > 0 ? { params } : {}),
          ...(Number.isInteger(parsedMaxParallel) && parsedMaxParallel >= 1 ? { maxParallel: parsedMaxParallel } : {}),
        });
      }
    } catch (error) {
      setExecutionError(error instanceof Error ? error.message : String(error));
      return;
    }
    setRuns(previous => [created, ...previous]);
    setSelectedRunId(created.id);
    setEventsByRun(previous => ({ ...previous, [created.id]: [] }));
    setActiveNavigation('runs');
    setLayout(previous => previous.sidebarVisible ? previous : toggleWorkbenchPart(previous, 'sidebar'));
    if (runtime === 'workflow') {
      const trimmedPrompt = runPrompt.trim();
      if (trimmedPrompt) {
        let injected = false;
        for (let attempt = 0; attempt < 6 && !injected; attempt += 1) {
          try {
            const sessions = await window.executionBackend.getRunSessions(created.id);
            const target = sessions.find(session => session.role === 'executor') ?? sessions[0];
            if (target) {
              await window.executionBackend.injectPrompt(created.id, target.session_id, trimmedPrompt);
              injected = true;
            }
          } catch {
            // The executor session may not exist yet right after the run
            // starts; retry for a few seconds before giving up softly.
          }
          if (!injected) await new Promise(resolve => setTimeout(resolve, 1000));
        }
        if (!injected) setExecutionError('提示词注入失败：执行会话尚未就绪，run 已照常启动');
      }
    }
  };
  const closeFile = (closedFile: string): void => {
    if (openFiles.length === 1) return;
    const nextFiles = openFiles.filter(openFile => openFile !== closedFile);
    setOpenFiles(nextFiles);
    if (file === closedFile) setFile(nextFiles[nextFiles.length - 1]);
  };
  const cancelRun = async (): Promise<void> => {
    if (!selectedRun) return;
    try {
      await client.cancelRun(selectedRun.id);
    } catch (error) {
      setExecutionError(error instanceof Error ? error.message : String(error));
      return;
    }
    const latest = await client.getRun(selectedRun.id);
    setRuns(previous => previous.map(item => item.id === latest.id ? latest : item));
  };
  const openInsightForRun = async (): Promise<void> => {
    if (!selectedRun) return;
    setExecutionError(undefined);
    try {
      if (selectedRun.runtimeId === 'session') {
        const result = await window.executionBackend.importToInsight(selectedRun.id);
        if (!result.ok) { setExecutionError(result.error ?? t.insightLoadFailed); return; }
        setInsightPath('/insight/session/' + encodeURIComponent(selectedRun.id));
        setActiveNavigation('insight');
        return;
      }
      const sessions = await window.executionBackend.getRunSessions(selectedRun.id);
      const target = sessions.find(session => session.role === 'executor') ?? sessions[0];
      if (!target) { setExecutionError(t.noObservableSessions); return; }
      const result = await window.executionBackend.importToInsight(target.session_id);
      if (!result.ok) { setExecutionError(result.error ?? t.insightLoadFailed); return; }
      setInsightPath('/insight/session/' + encodeURIComponent(target.session_id));
      setActiveNavigation('insight');
    } catch (error) {
      setExecutionError(error instanceof Error ? error.message : String(error));
    }
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
      {showSidebar && activeNavigation === 'workbench' && <WorkspaceExplorer tree={tree} activeFile={file} onSelect={selectFile} onSave={save} messages={t} />}
      {showSidebar && activeNavigation === 'runs' && <RunsList runs={runs} selectedRunId={selectedRunId} error={executionError} onSelectRun={setSelectedRunId} onRun={startRun} runtime={runtime} onRuntimeChange={setRuntime} runLabel={runLabel} onRunLabelChange={setRunLabel} runParams={runParams} onRunParamsChange={setRunParams} maxParallel={maxParallel} onMaxParallelChange={setMaxParallel} runPrompt={runPrompt} onRunPromptChange={setRunPrompt} sessionPrompt={sessionPrompt} onSessionPromptChange={setSessionPrompt} sessionRuntime={sessionRuntime} onSessionRuntimeChange={changeSessionRuntime} sessionModel={selectedSessionModel?.model ?? ''} sessionModels={sessionModelOptions} sessionModelPlaceholder={sessionModelPlaceholder} onSessionModelChange={setSessionModel} sessionSystemPrompt={sessionSystemPrompt} onSessionSystemPromptChange={setSessionSystemPrompt} sessionMaxIterations={sessionMaxIterations} onSessionMaxIterationsChange={setSessionMaxIterations} sessionReviewerEnabled={sessionReviewerEnabled} onSessionReviewerEnabledChange={setSessionReviewerEnabled} messages={t} />}
      {showSidebar && <ResizeHandle direction="horizontal" onResize={delta => setExplorerWidth(Math.max(180, Math.min(360, explorerWidth + delta)))} />}
    </div>
    <div className="app-content" ref={appContent}>
      <div className="workbench-body">
        <div className="workbench-main" style={{ gridTemplateRows: 'minmax(0, 1fr)' }}>
          {activeNavigation === 'workbench' && <section className="workspace-grid">
            <div className={'editor-groups split-' + splitDirection}>
              <MonacoEditor files={openFiles} activeFile={file} content={content} onChange={nextContent => setContents(previous => ({ ...previous, [file]: nextContent }))} onSelectFile={selectFile} onCloseFile={closeFile} splitDirection={splitDirection} onSplit={splitEditor} colorScheme={selectedTheme.colorScheme} tokens={selectedTheme.tokens} fontFamily={selectedFont.family} messages={t} />
              {splitDirection !== 'none' && <MonacoEditor files={openFiles} activeFile={file} content={content} onChange={nextContent => setContents(previous => ({ ...previous, [file]: nextContent }))} onSelectFile={selectFile} onCloseFile={closeFile} splitDirection={splitDirection} onSplit={splitEditor} showSplitActions={false} colorScheme={selectedTheme.colorScheme} tokens={selectedTheme.tokens} fontFamily={selectedFont.family} messages={t} />}
            </div>
          </section>}
          {activeNavigation === 'runs' && (selectedRun
            ? <section className="single-panel"><RunDetail key={selectedRun.id} run={selectedRun} events={selectedEvents} onCancel={cancelRun} onOpenInsight={openInsightForRun} messages={t} /></section>
            : <section className="single-panel"><section className="run-detail run-empty-bg"><div className="empty-state"><span className="empty-icon">▶</span><strong>{t.selectRun}</strong><p>{t.selectRunHint}</p></div></section></section>)}
          {activeNavigation === 'insight' && <section className="insight-pane"><span className="empty-icon">◉</span><strong>{t.insight}</strong><p>{insightFailed ? t.insightLoadFailed : t.insightHint}</p></section>}
        </div>
      </div>
    </div>
    <footer className="status-bar"><span className="status-live"><i aria-hidden="true" />{workspace ? t.workspaceReady : t.noWorkspace}</span><span>{file}</span><span>UTF-8</span><span>LF</span><span>{t.markdown}</span></footer>
    <dialog className="workspace-required-dialog" ref={workspaceRequiredDialog} aria-labelledby="workspace-required-title" aria-describedby="workspace-required-message">
      <h2 id="workspace-required-title">{t.workspaceRequiredTitle}</h2>
      <p id="workspace-required-message">{t.workspaceRequiredMessage}</p>
      <div className="workspace-required-actions">
        <button className="secondary-button" type="button" onClick={() => workspaceRequiredDialog.current?.close()}>{t.cancel}</button>
        <button className="primary-button" type="button" onClick={() => {
          workspaceRequiredDialog.current?.close();
          void chooseWorkspace();
        }}>{t.openWorkspace}</button>
      </div>
    </dialog>
    {settingsOpen && <SettingsModal theme={theme} font={font} locale={locale} executionBackendUrl={effectiveExecutionBackendUrl} backgroundImage={backgroundImage} backgroundFit={backgroundFit} onBackgroundImageChange={setBackgroundImage} onBackgroundFitChange={setBackgroundFit} onExecutionBackendUrlChange={url => { setExecutionBackendUrl(url); saveWorkbenchState(EXECUTION_BACKEND_URL_STORAGE_KEY, url); void window.executionBackend.setBaseUrl(url).then(() => client.listRuns()).then(setRuns).catch((error: Error) => setExecutionError(error.message)); }} onThemeChange={setTheme} onFontChange={setFont} onLocaleChange={setLocale} onClose={() => setSettingsOpen(false)} messages={t} />}
  </main>;
}
