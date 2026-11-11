import { useEffect, useRef, useState } from 'react';
import { WorkbenchExecutionClient } from './services/executionClient';
import type { SessionModelOption } from '../shared/executionBackendIpc';
import { DEFAULT_EXECUTION_BACKEND_URL } from '../shared/executionBackendConfig';
import { GRAPH_WORKFLOW_FORMAT, type GraphRunParams, type Run, type RunEvent, type RuntimeId } from '../shared/protocol';
import { isTerminalRun, runEventKey } from '../shared/run';
import type { GraphVariableRow } from './components/RunsPanel';
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
import { EXECUTION_BACKEND_URL_STORAGE_KEY, loadExecutionBackendUrl, loadWorkbenchState, saveWorkbenchState } from './workbench/storage';
import { createWorkbenchServices, WorkbenchCommandService } from './workbench/services';
import { SettingsModal } from './components/SettingsModal';
import type { FontId, ThemeId } from './components/SettingsModal';
import { defaultFont, defaultTheme, fonts, migrateLegacyThemeId, themes } from './settings';
import { messages, type LocaleId } from './i18n';

const client = new WorkbenchExecutionClient();
type ContentTab = { kind: 'file' | 'run' | 'insight'; resource: string };

const insightTab: ContentTab = { kind: 'insight', resource: '' };
const tabKey = ({ kind, resource }: ContentTab): string => kind + ':' + resource;
const fileName = (path: string): string => path.split('/').at(-1) ?? path;

export default function App(): JSX.Element {
  const [workspace, setWorkspace] = useState<string>();
  const workspaceRequiredDialog = useRef<HTMLDialogElement>(null);
  const [tree, setTree] = useState<WorkspaceNode[]>([]);
  const [file, setFile] = useState('');
  const [contents, setContents] = useState<Record<string, string>>({});
  const [runs, setRuns] = useState<Run[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string>();
  const [eventsByRun, setEventsByRun] = useState<Record<string, RunEvent[]>>({});
  const [activeNavigation, setActiveNavigation] = useState('workbench');
  const [insightFromRail, setInsightFromRail] = useState(false);
  const [contentTabs, setContentTabs] = useState<ContentTab[]>([]);
  const [activeTabKey, setActiveTabKey] = useState<string>();
  const lastRegularTabKey = useRef<string>();
  const activeTab = contentTabs.find(tab => tabKey(tab) === activeTabKey);
  const activateTab = (tab: ContentTab): void => {
    const key = tabKey(tab);
    setActiveTabKey(key);
    if (tab.kind !== 'insight') {
      lastRegularTabKey.current = key;
      setInsightFromRail(false);
    }
    if (tab.kind === 'file') setFile(tab.resource);
    if (tab.kind === 'run') setSelectedRunId(tab.resource);
  };
  const openContentTab = (tab: ContentTab): void => {
    setContentTabs(previous => previous.some(item => tabKey(item) === tabKey(tab)) ? previous : [...previous, tab]);
    activateTab(tab);
  };
  const closeContentTab = (tab: ContentTab): void => {
    const key = tabKey(tab);
    const index = contentTabs.findIndex(item => tabKey(item) === key);
    const remaining = contentTabs.filter(item => tabKey(item) !== key);
    setContentTabs(remaining);
    if (tab.kind === 'file' && tab.resource === file) {
      setFile(remaining.filter(item => item.kind === 'file').at(-1)?.resource ?? '');
    }
    if (tab.kind === 'run' && tab.resource === selectedRunId) {
      setSelectedRunId(remaining.filter(item => item.kind === 'run').at(-1)?.resource);
    }
    if (activeTabKey !== key) return;
    if (tab.kind === 'insight') setInsightFromRail(false);
    const neighbor = remaining[index] ?? remaining.at(-1);
    if (neighbor) activateTab(neighbor);
    else setActiveTabKey(undefined);
  };
  const [explorerWidth, setExplorerWidth] = useState(220);
  const [layout, setLayout] = useState(() => loadWorkbenchState('workbench.layout', createWorkbenchLayout()));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeId>(() => migrateLegacyThemeId(loadWorkbenchState('workbench.theme', defaultTheme.id)));
  const [font, setFont] = useState<FontId>(() => loadWorkbenchState('workbench.font', defaultFont.id));
  const [locale, setLocale] = useState<LocaleId>(() => loadWorkbenchState('workbench.locale', 'zh-CN'));
  const [backgroundImage, setBackgroundImage] = useState(() => loadWorkbenchState('workbench.backgroundImage', ''));
  const [backgroundFit, setBackgroundFit] = useState<'cover' | 'contain'>(() => loadWorkbenchState<'cover' | 'contain'>('workbench.backgroundFit', 'cover'));
  const [executionBackendUrl, setExecutionBackendUrl] = useState(loadExecutionBackendUrl);
  const [executionError, setExecutionError] = useState<string>();
  const [runtime, setRuntime] = useState<RuntimeId>(() => {
    const stored = loadWorkbenchState<string>('workbench.runtime', 'workflow');
    return stored === 'session' || stored === 'opsbot-session' ? 'session' : 'workflow';
  });
  const [runLabel, setRunLabel] = useState('');
  const [runProgramPath, setRunProgramPath] = useState('');
  const [graphVariables, setGraphVariables] = useState<GraphVariableRow[]>([]);
  const [graphOptions, setGraphOptions] = useState<GraphRunParams>({});
  const [graphModel, setGraphModel] = useState('');
  const [maxParallel, setMaxParallel] = useState('');
  const [runPrompt, setRunPrompt] = useState('');
  const [sessionPrompt, setSessionPrompt] = useState('');
  const [sessionRuntime, setSessionRuntime] = useState('claude_sdk');
  const [sessionModel, setSessionModel] = useState('');
  const [sessionModels, setSessionModels] = useState<SessionModelOption[] | 'loading' | 'unavailable'>('loading');
  const [loadedModelRuntime, setLoadedModelRuntime] = useState<string>();
  const [sessionSystemPrompt, setSessionSystemPrompt] = useState('');
  const [sessionMaxIterations, setSessionMaxIterations] = useState('');
  const [sessionReviewerEnabled, setSessionReviewerEnabled] = useState(false);
  const [insightPath, setInsightPath] = useState('/');
  const [insightFailed, setInsightFailed] = useState(false);
  const effectiveExecutionBackendUrl = executionBackendUrl ?? DEFAULT_EXECUTION_BACKEND_URL;
  const appContent = useRef<HTMLDivElement>(null);
  const importedToInsight = useRef(new Set<string>());
  const t = messages[locale];
  const modelRuntime = runtime === 'workflow' ? graphOptions.runtime : sessionRuntime;
  const sessionModelOptions = modelRuntime === loadedModelRuntime && Array.isArray(sessionModels) ? sessionModels : [];
  const selectedModel = sessionModelOptions.find(option => option.model === (runtime === 'workflow' ? graphModel : sessionModel));
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
  useEffect(() => saveWorkbenchState('workbench.theme', theme), [theme]);
  useEffect(() => saveWorkbenchState('workbench.font', font), [font]);
  useEffect(() => saveWorkbenchState('workbench.locale', locale), [locale]);
  const bootListRuns = async (): Promise<void> => {
    // Retry transient run-list errors after the startup readiness check.
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
    if (!modelRuntime || activeNavigation !== 'runs' || settingsOpen) return;
    const setModel = runtime === 'workflow' ? setGraphModel : setSessionModel;
    let cancelled = false;
    setSessionModels('loading');
    void (async () => {
      try {
        const options = await window.executionBackend.listSessionModels(modelRuntime);
        if (cancelled) return;
        setLoadedModelRuntime(modelRuntime);
        setSessionModels(options);
        setModel(current => options.some(option => option.model === current) ? current : '');
      } catch {
        if (cancelled) return;
        setSessionModels('unavailable');
        setModel('');
      }
    })();
    return () => { cancelled = true; };
  }, [runtime, modelRuntime, activeNavigation, settingsOpen, executionBackendUrl]);
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
    if (activeTab?.kind !== 'insight' || settingsOpen) { void window.insight.hide(); return; }
    setInsightFailed(false);
    const node = appContent.current;
    if (!node) return;
    const bounds = () => {
      const rect = node.getBoundingClientRect();
      return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
    };
    void window.insight.show(insightPath, bounds(), selectedTheme.colorScheme === 'dark');
    const observer = new ResizeObserver(() => { void window.insight.updateBounds(bounds()); });
    observer.observe(node);
    return () => observer.disconnect();
  }, [activeTab?.kind, insightPath, selectedTheme.colorScheme, settingsOpen]);
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
      if (item === 'insight') {
        if (activeTab?.kind === 'insight') {
          setInsightFromRail(false);
          const previousTab = contentTabs.find(tab => tabKey(tab) === lastRegularTabKey.current)
            ?? contentTabs.filter(tab => tab.kind !== 'insight').at(-1);
          if (previousTab) activateTab(previousTab);
          else setActiveTabKey(undefined);
        } else {
          setInsightFromRail(true);
          openContentTab(insightTab);
        }
        return;
      }
      setLayout(previous => ({
        ...previous,
        sidebarVisible: item !== activeNavigation || insightFromRail || !previous.sidebarVisible,
      }));
      setInsightFromRail(false);
      setActiveNavigation(item);
    });
    commands.execute('workbench.navigate');
  };

  const content = contents[file] ?? '';
  const defaultProgramPath = workspace && file ? `${workspace}/${file}` : '';
  const loadWorkspaceTree = async (): Promise<void> => {
    const workspaceTree = await window.workbench.listTree();
    setTree(workspaceTree);
    const firstMarkdown = workspaceTree.find(node => node.type === 'file' && node.name.endsWith('.md'));
    const initialFile = firstMarkdown?.path ?? workspaceTree.find(node => node.type === 'file')?.path ?? '';
    const initialTab: ContentTab | undefined = initialFile ? { kind: 'file', resource: initialFile } : undefined;
    setContentTabs(previous => [
      ...previous.filter(tab => tab.kind !== 'file'),
      ...(initialTab ? [initialTab] : []),
    ]);
    setFile(initialFile);
    if (initialTab) activateTab(initialTab);
    else setActiveTabKey(previous => previous?.startsWith('file:') ? undefined : previous);
    if (initialFile) {
      const initialContent = await window.workbench.readFile(initialFile);
      setContents(previous => ({ ...previous, [initialFile]: initialContent }));
    }
  };
  const chooseWorkspace = async (): Promise<void> => {
    const selected = await window.workbench.chooseWorkspace();
    if (!selected) return;
    if (selected !== workspace) setContents({});
    setWorkspace(selected);
    await loadWorkspaceTree();
  };
  const selectFile = async (nextFile: string): Promise<void> => {
    openContentTab({ kind: 'file', resource: nextFile });
    if (workspace && !Object.prototype.hasOwnProperty.call(contents, nextFile)) {
      const nextContent = await window.workbench.readFile(nextFile);
      setContents(previous => ({ ...previous, [nextFile]: nextContent }));
    }
  };
  const save = async (): Promise<void> => { if (workspace && file && contents[file] !== undefined) await window.workbench.writeFile(file, contents[file]); };
  const changeSessionRuntime = (value: string): void => {
    setSessionRuntime(value);
    setSessionModel('');
    setSessionModels('loading');
  };
  const changeGraphOptions = (options: GraphRunParams): void => {
    if (options.runtime !== graphOptions.runtime) {
      setGraphModel('');
      setSessionModels('loading');
    }
    setGraphOptions(options);
  };
  const startRun = async (): Promise<void> => {
    if (!workspace) { workspaceRequiredDialog.current?.showModal(); return; }
    setExecutionError(undefined);
    let created: Run;
    try {
      if (runtime === 'session') {
        if (!sessionPrompt.trim()) { setExecutionError('会话模式需要填写提示词'); return; }
        if (!selectedModel) { setExecutionError(sessionModelPlaceholder); return; }
        const parsedMaxIterations = Number.parseInt(sessionMaxIterations, 10);
        created = await client.createRun({
          workflowId: '',
          workspacePath: workspace,
          runtime,
          prompt: sessionPrompt,
          sessionRuntime,
          model: selectedModel.model,
          providerIndex: selectedModel.providerIndex,
          ...(sessionSystemPrompt.trim() ? { systemPrompt: sessionSystemPrompt.trim() } : {}),
          ...(Number.isInteger(parsedMaxIterations) && parsedMaxIterations >= 1 ? { maxIterations: parsedMaxIterations } : {}),
          reviewerEnabled: sessionReviewerEnabled,
        });
      } else {
        const programPath = runProgramPath.trim() || defaultProgramPath;
        if (programPath && (programPath === file || programPath === defaultProgramPath)) await save();
        const variables = Object.fromEntries(graphVariables
          .filter(row => row.key.trim())
          .map(row => [row.key.trim(), row.value]));
        const params: GraphRunParams = { ...graphOptions };
        if (Object.keys(variables).length) params.variables = JSON.stringify(variables);
        if (runPrompt.trim()) params.starting_prompt = runPrompt.trim();
        if (graphOptions.runtime && selectedModel) {
          params.model = selectedModel.model;
          params.provider_index = selectedModel.providerIndex;
        }
        const parsedMaxParallel = Number.parseInt(maxParallel, 10);
        created = await client.createRun({
          workflowId: file,
          programPath,
          format: GRAPH_WORKFLOW_FORMAT,
          workspacePath: workspace,
          content,
          runtime,
          label: runLabel.trim() || programPath.split('/').pop(),
          ...(Object.keys(params).length > 0 ? { params } : {}),
          ...(Number.isInteger(parsedMaxParallel) && parsedMaxParallel >= 1 ? { maxParallel: parsedMaxParallel } : {}),
        });
      }
    } catch (error) {
      setExecutionError(error instanceof Error ? error.message : String(error));
      return;
    }
    setRuns(previous => [created, ...previous]);
    setEventsByRun(previous => ({ ...previous, [created.id]: [] }));
    setActiveNavigation('runs');
    openContentTab({ kind: 'run', resource: created.id });
    setLayout(previous => previous.sidebarVisible ? previous : toggleWorkbenchPart(previous, 'sidebar'));
  };
  const refreshRunAfterAction = async (id: string): Promise<void> => {
    // The event subscription can still refresh the run if this read fails.
    const latest = await client.getRun(id).catch(() => undefined);
    if (latest) setRuns(previous => previous.map(item => item.id === latest.id ? latest : item));
  };
  const openInsightForRun = async (run: Run): Promise<void> => {
    setExecutionError(undefined);
    try {
      let sessionId = run.id;
      if (run.runtimeId !== 'session') {
        const sessions = await window.executionBackend.getRunSessions(run.id);
        const target = sessions.find(session => session.role === 'executor') ?? sessions[0];
        if (!target) { setExecutionError(t.noObservableSessions); return; }
        sessionId = target.session_id;
      }
      const result = await window.executionBackend.importToInsight(sessionId);
      if (!result.ok) { setExecutionError(result.error ?? t.insightLoadFailed); return; }
      const directPath = result.insightUrl?.replace(/^\/insight(?=\/)/, '');
      setInsightPath(directPath && /^\/(run|session)\//.test(directPath)
        ? directPath
        : '/session/' + encodeURIComponent(result.sessionId ?? sessionId));
      openContentTab(insightTab);
    } catch (error) {
      setExecutionError(error instanceof Error ? error.message : String(error));
    }
  };

  const showSidebar = layout.sidebarVisible && !insightFromRail;
  const activeRail = settingsOpen ? 'settings' : insightFromRail ? 'insight' : showSidebar ? activeNavigation : '';
  return <main className="app-shell">
      <header className="topbar">
        <div className="topbar-navigation">
          <button className="icon-button" type="button" aria-label={t.back} title={t.back}>‹</button>
          <button className="icon-button" type="button" aria-label={t.forward} title={t.forward}>›</button>
          <button className="quick-search" type="button">{t.search}</button>
        </div>
        <div className="topbar-actions">
          <button className="icon-button" type="button" onClick={() => setLayout(previous => toggleWorkbenchPart(previous, 'sidebar'))} aria-label={t.toggleSidebar} title={t.toggleSidebar}><span className="sidebar-toggle-icon" aria-hidden="true" /></button>
        </div>
      </header>
    <div className="left-workbench" data-sidebar-open={showSidebar}
      style={showSidebar ? { gridTemplateColumns: `var(--rail-width) ${explorerWidth}px 4px` } : undefined}>
      <NavigationRail active={activeRail} onSelect={navigate} messages={t} />
      {showSidebar && activeNavigation === 'workbench' && <WorkspaceExplorer hasWorkspace={Boolean(workspace)} onOpenWorkspace={chooseWorkspace} tree={tree} activeFile={file} onSelect={selectFile} onSave={save} messages={t} />}
      {showSidebar && activeNavigation === 'runs' && <RunsList runs={runs} selectedRunId={selectedRunId} error={executionError} onSelectRun={id => openContentTab({ kind: 'run', resource: id })} onRun={startRun} runtime={runtime} onRuntimeChange={setRuntime} runLabel={runLabel} onRunLabelChange={setRunLabel} runProgramPath={runProgramPath} defaultProgramPath={defaultProgramPath} onRunProgramPathChange={setRunProgramPath} graphVariables={graphVariables} onGraphVariablesChange={setGraphVariables} graphOptions={graphOptions} onGraphOptionsChange={changeGraphOptions} maxParallel={maxParallel} onMaxParallelChange={setMaxParallel} runPrompt={runPrompt} onRunPromptChange={setRunPrompt} sessionPrompt={sessionPrompt} onSessionPromptChange={setSessionPrompt} sessionRuntime={sessionRuntime} onSessionRuntimeChange={changeSessionRuntime} sessionModel={selectedModel?.model ?? ''} sessionModels={sessionModelOptions} sessionModelPlaceholder={sessionModelPlaceholder} onSessionModelChange={runtime === 'workflow' ? setGraphModel : setSessionModel} sessionSystemPrompt={sessionSystemPrompt} onSessionSystemPromptChange={setSessionSystemPrompt} sessionMaxIterations={sessionMaxIterations} onSessionMaxIterationsChange={setSessionMaxIterations} sessionReviewerEnabled={sessionReviewerEnabled} onSessionReviewerEnabledChange={setSessionReviewerEnabled} messages={t} />}
      {showSidebar && <ResizeHandle direction="horizontal" onResize={delta => setExplorerWidth(Math.max(180, Math.min(360, explorerWidth + delta)))} />}
    </div>
    <section className="app-content" aria-label={t.workbench}>
      {contentTabs.length > 0 && <div className="content-tabs" role="tablist" aria-label={t.openTabs}>
        {contentTabs.map(tab => {
          const key = tabKey(tab);
          const run = tab.kind === 'run' ? runs.find(item => item.id === tab.resource) : undefined;
          const label = tab.kind === 'file' ? fileName(tab.resource) : tab.kind === 'run' ? run?.workflowId ?? tab.resource : t.insight;
          const title = tab.kind === 'file' ? tab.resource : run ? `${label} · ${run.id}` : label;
          const selected = key === activeTabKey;
          return <div className={'content-tab' + (selected ? ' active' : '')} key={key}>
            <button className="content-tab-label" type="button" role="tab" aria-selected={selected} title={title} onClick={() => activateTab(tab)}>
              <span className={`content-tab-icon icon-${tab.kind}`} aria-hidden="true">{tab.kind === 'file' ? '≡' : tab.kind === 'run' ? '▶' : '◉'}</span>
              <span className="content-tab-name">{label}</span>
            </button>
            <button type="button" className="content-tab-close" aria-label={t.closeTab(label)} onClick={() => closeContentTab(tab)}>×</button>
          </div>;
        })}
      </div>}
      <div className="content-panels">
        {file && <section hidden={activeTab?.kind !== 'file'} className="workspace-grid" role="tabpanel" aria-label={fileName(file)}>
          <div className={'editor-groups split-' + splitDirection}>
            <MonacoEditor activeFile={file} content={content} onChange={nextContent => setContents(previous => ({ ...previous, [file]: nextContent }))} splitDirection={splitDirection} onSplit={splitEditor} colorScheme={selectedTheme.colorScheme} tokens={selectedTheme.tokens} fontFamily={selectedFont.family} messages={t} />
            {splitDirection !== 'none' && <MonacoEditor activeFile={file} content={content} onChange={nextContent => setContents(previous => ({ ...previous, [file]: nextContent }))} splitDirection={splitDirection} onSplit={splitEditor} showSplitActions={false} colorScheme={selectedTheme.colorScheme} tokens={selectedTheme.tokens} fontFamily={selectedFont.family} messages={t} />}
          </div>
        </section>}
        {contentTabs.filter(tab => tab.kind === 'run').map(tab => {
          const run = runs.find(item => item.id === tab.resource);
          if (!run) return null;
          return <section key={tab.resource} hidden={activeTabKey !== tabKey(tab)} className="single-panel" role="tabpanel" aria-label={run.workflowId}>
            <RunDetail run={run} events={eventsByRun[run.id] ?? []} onOpenInsight={() => openInsightForRun(run)}
              onStop={async () => {
                await client.stopRun(run.id);
                await refreshRunAfterAction(run.id);
              }}
              onSetPaused={async paused => {
                await client.setSessionPaused(run.id, paused);
                await refreshRunAfterAction(run.id);
              }}
              onSendReply={text => client.sendSessionReply(run.id, text)} messages={t} />
          </section>;
        })}
        {activeTab?.kind === 'insight' && <section ref={appContent} role="tabpanel" aria-label={t.insight} className="insight-pane"><span className="empty-icon">◉</span><strong>{t.insight}</strong><p>{insightFailed ? t.insightLoadFailed : t.insightHint}</p></section>}
        {(!activeTab || (activeTab.kind === 'run' && !runs.some(run => run.id === activeTab.resource))) && <section className={activeNavigation === 'runs' ? 'single-panel' : 'workspace-grid'}>
          <div className="empty-panel">{activeNavigation === 'runs' && <div className="empty-state"><span className="empty-icon">▶</span><strong>{t.selectRun}</strong><p>{t.selectRunHint}</p></div>}</div>
        </section>}
      </div>
    </section>
    <footer className="status-bar"><span className="status-live"><i aria-hidden="true" />{workspace ? t.workspaceReady : t.noWorkspace}</span>{file && <><span>{file}</span><span>UTF-8</span><span>LF</span><span>{t.markdown}</span></>}</footer>
    <dialog className="workbench-dialog" ref={workspaceRequiredDialog} aria-labelledby="workspace-required-title" aria-describedby="workspace-required-message">
      <h2 id="workspace-required-title">{t.workspaceRequiredTitle}</h2>
      <p id="workspace-required-message">{t.workspaceRequiredMessage}</p>
      <div className="workbench-dialog-actions">
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
