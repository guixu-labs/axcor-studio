import { useCallback, useEffect, useRef, useState } from 'react';
import { WorkbenchExecutionClient } from './services/executionClient';
import type { SessionModelOption } from '../shared/executionBackendIpc';
import {
  GRAPH_WORKFLOW_FORMAT,
  type GraphRunParams,
  type Run,
  type RunEvent,
  type RuntimeId,
} from '../shared/protocol';
import { isTerminalRun, runEventKey } from '../shared/run';
import type { GraphVariableRow } from './components/RunsPanel';
import type { WorkspaceNode } from '../workspaceFiles';
import type { Workspace, WorkspaceFileChange } from '../shared/workspace';
import { remoteWorkspaceCopy } from './components/RemoteWorkspaceForm';
import './remote-workspace.css';
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

const client = new WorkbenchExecutionClient();
const parentDirectory = (path: string): string => path.slice(0, Math.max(0, path.lastIndexOf('/')));
type ContentTab = { kind: 'file' | 'run' | 'insight'; resource: string };

const insightTab: ContentTab = { kind: 'insight', resource: '' };
const tabKey = ({ kind, resource }: ContentTab): string => kind + ':' + resource;
const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));
const fileName = (path: string): string => path.split('/').at(-1) ?? path;

export default function App(): JSX.Element {
  const [workspace, setWorkspace] = useState<Workspace>();
  const currentWorkspace = useRef<Workspace>();
  const generation = useRef(0);
  const changingWorkspace = useRef(false);
  const versions = useRef<Record<string, string | undefined>>(Object.create(null));
  const savingFiles = useRef(new Set<string>());
  const fileRequests = useRef(new Map<string, symbol>());
  const queueFileSync = useRef<(id: string, change: WorkspaceFileChange) => void>();
  const syncRemoteFiles = useRef<(id: string, change: WorkspaceFileChange) => Promise<void>>();
  const selection = useRef<symbol>();
  const [workspaceError, setWorkspaceError] = useState<string>();
  const [startingRun, setStartingRun] = useState(false);
  const runInFlight = useRef(false);
  const [reviewRuns, setReviewRuns] = useState(false);
  const saveChangesDialog = useRef<HTMLDialogElement>(null);
  const [tree, setTree] = useState<WorkspaceNode[]>([]);
  const remoteDirectories = useRef(new Map<string, WorkspaceNode[]>());
  const [file, setFile] = useState('');
  const [contents, setContents] = useState<Record<string, string>>({});
  const [savedContents, setSavedContents] = useState<Record<string, string>>({});
  const changedFiles = useRef(new Map<string, symbol>());
  const [pendingClosePath, setPendingClosePath] = useState<string>();
  const [savingBeforeClose, setSavingBeforeClose] = useState(false);
  const [closeSaveError, setCloseSaveError] = useState(false);
  const isFileDirty = (path: string): boolean =>
    savedContents[path] !== undefined && contents[path] !== savedContents[path];
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
    setContentTabs(previous => (previous.some(item => tabKey(item) === tabKey(tab)) ? previous : [...previous, tab]));
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
  const requestCloseTab = (tab: ContentTab): void => {
    if (tab.kind === 'file' && isFileDirty(tab.resource)) {
      setPendingClosePath(tab.resource);
      setCloseSaveError(false);
      saveChangesDialog.current?.showModal();
      return;
    }
    closeContentTab(tab);
  };
  const [explorerWidth, setExplorerWidth] = useState(220);
  const [layout, setLayout] = useState(() => loadWorkbenchState('workbench.layout', createWorkbenchLayout()));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeId>(() =>
    migrateLegacyThemeId(loadWorkbenchState('workbench.theme', defaultTheme.id)),
  );
  const [font, setFont] = useState<FontId>(() => loadWorkbenchState('workbench.font', defaultFont.id));
  const [locale, setLocale] = useState<LocaleId>(() => loadWorkbenchState('workbench.locale', 'zh-CN'));
  const [backgroundImage, setBackgroundImage] = useState(() => loadWorkbenchState('workbench.backgroundImage', ''));
  const [backgroundFit, setBackgroundFit] = useState<'cover' | 'contain'>(() =>
    loadWorkbenchState<'cover' | 'contain'>('workbench.backgroundFit', 'cover'),
  );
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
  const [insightFailed, setInsightFailed] = useState<string>();
  const [openingInsight, setOpeningInsight] = useState(false);
  const [insightRetry, setInsightRetry] = useState(0);
  const appContent = useRef<HTMLDivElement>(null);
  const importedToInsight = useRef(new Set<string>());
  const t = messages[locale];
  const english = locale === 'en-US';
  const remoteCopy = remoteWorkspaceCopy(english);
  const remote = workspace?.kind === 'ssh';
  const disconnected = remote && !workspace.connected;
  const modelRuntime = runtime === 'workflow' ? graphOptions.runtime : sessionRuntime;
  const sessionModelOptions =
    modelRuntime === loadedModelRuntime && Array.isArray(sessionModels) ? sessionModels : [];
  const selectedModel = sessionModelOptions.find(
    option => option.model === (runtime === 'workflow' ? graphModel : sessionModel),
  );
  const sessionModelPlaceholder =
    sessionModels === 'loading'
      ? t.sessionModelsLoading
      : sessionModels === 'unavailable'
        ? t.sessionModelsUnavailable
        : sessionModelOptions.length
          ? t.sessionSelectModel
          : t.sessionModelsEmpty;
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
  const loadRemoteDirectory = useCallback(async (
    target: Workspace,
    scope: number,
    path: string,
  ): Promise<WorkspaceNode[] | undefined> => {
    const entries = await window.workbench.listTree(target.id, path);
    if (scope !== generation.current) return;
    const directories = remoteDirectories.current;
    if (path && !directories.get(parentDirectory(path))?.some(node => node.type === 'dir' && node.path === path))
      return;
    directories.set(path, entries);
    const prefix = path ? path + '/' : '';
    const children = new Set(entries.filter(node => node.type === 'dir').map(node => node.path));
    for (const cached of directories.keys()) {
      if (cached === path || !cached.startsWith(prefix)) continue;
      const child = cached.slice(prefix.length).split('/', 1)[0];
      if (!children.has(prefix + child)) directories.delete(cached);
    }
    setTree([...directories.values()].flat());
    return entries;
  }, []);
  const loadWorkspaceTree = useCallback(async (target: Workspace, scope: number): Promise<void> => {
    if (target.kind === 'ssh') {
      await loadRemoteDirectory(target, scope, '');
      return;
    }
    const workspaceTree = await window.workbench.listTree(target.id);
    if (scope === generation.current) setTree(workspaceTree);
  }, [loadRemoteDirectory]);
  const refreshRuns = async (attempts = 1): Promise<void> => {
    const scope = generation.current;
    for (let attempt = 0; attempt < attempts && scope === generation.current; attempt += 1) {
      try {
        const next = await client.listRuns();
        if (scope !== generation.current) return;
        setRuns(next);
        return;
      } catch (error) {
        if (scope !== generation.current) return;
        if (attempt === attempts - 1) throw error;
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  };
  useEffect(() => {
    const unsubscribe = window.workbench.onDisconnected(id => {
      const current = currentWorkspace.current;
      if (current?.kind !== 'ssh' || current.id !== id) return;
      const next = { ...current, connected: false };
      currentWorkspace.current = next;
      setWorkspace(next);
    });
    const scope = generation.current;
    void window.workbench
      .getWorkspace()
      .then(async current => {
        if (scope !== generation.current) return;
        currentWorkspace.current = current;
        setWorkspace(current);
        if (current) await loadWorkspaceTree(current, scope);
      })
      .catch(error => setWorkspaceError(errorMessage(error)));
    void refreshRuns(6).catch(error => setExecutionError(errorMessage(error)));
    return () => {
      generation.current += 1;
      unsubscribe();
    };
  }, [loadWorkspaceTree]);
  useEffect(() => {
    if (!modelRuntime || activeNavigation !== 'runs' || settingsOpen || disconnected) return;
    const setModel = runtime === 'workflow' ? setGraphModel : setSessionModel;
    let cancelled = false;
    setSessionModels('loading');
    void (async () => {
      try {
        const options = await window.executionBackend.listSessionModels(modelRuntime);
        if (cancelled) return;
        setLoadedModelRuntime(modelRuntime);
        setSessionModels(options);
        setModel(current => (options.some(option => option.model === current) ? current : ''));
      } catch {
        if (cancelled) return;
        setSessionModels('unavailable');
        setModel('');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [runtime, modelRuntime, activeNavigation, settingsOpen, workspace?.id, disconnected]);
  useEffect(() => {
    if (!selectedRunId) return;
    const scope = generation.current;
    let pending: RunEvent[] = [];
    let timer: ReturnType<typeof setTimeout> | undefined;
    let active = true;
    let refreshVersion = 0;
    const flushEvents = (): void => {
      const batch = pending;
      pending = [];
      if (!batch.length || scope !== generation.current) return;
      setEventsByRun(previous => {
        const current = previous[selectedRunId] ?? [];
        const combined = new Map(current.map(event => [runEventKey(event), event]));
        for (const event of batch) combined.set(runEventKey(event), event);
        if (combined.size === current.length) return previous;
        return {
          ...previous,
          [selectedRunId]: [...combined.values()].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)),
        };
      });
    };
    const refreshRun = (): void => {
      const version = ++refreshVersion;
      void client
        .getRun(selectedRunId)
        .then(async latest => {
          if (!active || version !== refreshVersion || scope !== generation.current) return;
          setRuns(previous => previous.map(item => (item.id === latest.id ? latest : item)));
          if (
            currentWorkspace.current?.kind !== 'ssh' &&
            isTerminalRun(latest) &&
            !importedToInsight.current.has(latest.id)
          ) {
            importedToInsight.current.add(latest.id);
            try {
              if (latest.runtimeId === 'session') {
                await window.executionBackend.importToInsight(latest.id);
              } else {
                const sessions = await window.executionBackend.getRunSessions(latest.id);
                for (const session of sessions) {
                  if (!active || scope !== generation.current) break;
                  await window.executionBackend.importToInsight(session.session_id);
                }
              }
            } catch {
              // Observability import is best-effort; the run view stays usable.
            }
          }
        })
        .catch(() => {
          /* A subsequent poll will retry. */
        });
    };
    const unsubscribe = client.subscribeRunEvents(selectedRunId, event => {
      if (scope !== generation.current) return;
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
    if (disconnected || activeTab?.kind !== 'insight' || settingsOpen || pendingClosePath) {
      void window.insight.hide();
      return;
    }
    setInsightFailed(undefined);
    const node = appContent.current;
    if (!node) return;
    const bounds = () => {
      const rect = node.getBoundingClientRect();
      return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
    };
    let active = true;
    void window.insight.show(insightPath, bounds(), selectedTheme.colorScheme === 'dark').catch(error => {
      if (active) setInsightFailed(errorMessage(error));
    });
    const observer = new ResizeObserver(() => {
      void window.insight.updateBounds(bounds());
    });
    observer.observe(node);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [
    activeTab?.kind,
    insightPath,
    selectedTheme.colorScheme,
    settingsOpen,
    pendingClosePath,
    disconnected,
    workspace,
    insightRetry,
  ]);
  useEffect(() => window.insight.onLoadFailed(setInsightFailed), []);
  useEffect(() => {
    Object.entries(selectedTheme.tokens).forEach(([name, value]) =>
      document.documentElement.style.setProperty('--theme-' + name, value),
    );
    document.documentElement.style.setProperty('--app-font', selectedFont.family);
    document.documentElement.style.setProperty('color-scheme', selectedTheme.colorScheme);
    document.documentElement.style.setProperty(
      '--empty-background-image',
      backgroundImage ? `url("${backgroundImage}")` : 'none',
    );
    document.documentElement.style.setProperty('--empty-background-size', backgroundFit);
  }, [backgroundFit, backgroundImage, selectedFont, selectedTheme]);
  useEffect(() => window.setNativeColorScheme(selectedTheme.colorScheme), [selectedTheme.colorScheme]);
  useEffect(() => saveWorkbenchState('workbench.backgroundImage', backgroundImage), [backgroundImage]);
  useEffect(() => saveWorkbenchState('workbench.backgroundFit', backgroundFit), [backgroundFit]);
  useEffect(() => saveWorkbenchState('workbench.runtime', runtime), [runtime]);
  const splitEditor = (direction: 'none' | 'horizontal' | 'vertical'): void => {
    commands.register('workbench.splitEditor', () => {
      if (direction === 'none') {
        setLayout(previous => ({ ...previous, editorLayout: createEditorGroupLayout() }));
        return;
      }
      setLayout(previous => ({
        ...previous,
        editorLayout: splitEditorGroup(previous.editorLayout, direction as EditorGroupOrientation),
      }));
    });
    commands.execute('workbench.splitEditor');
  };
  const navigate = (item: string): void => {
    commands.register('workbench.navigate', () => {
      if (item === 'settings') {
        setSettingsOpen(true);
        return;
      }
      if (item === 'insight') {
        if (activeTab?.kind === 'insight') {
          setInsightFromRail(false);
          const previousTab =
            contentTabs.find(tab => tabKey(tab) === lastRegularTabKey.current) ??
            contentTabs.filter(tab => tab.kind !== 'insight').at(-1);
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
  const updateEditorContent = (value: string): void => {
    changedFiles.current.set(file, Symbol());
    setContents(previous => ({ ...previous, [file]: value }));
  };
  const defaultProgramPath = workspace && file ? (remote ? file : `${workspace.root}/${file}`) : '';
  const readFile = async (target: Workspace, name: string, scope: number, keepDraft = false): Promise<void> => {
    const request = Symbol();
    const edit = changedFiles.current.get(name);
    fileRequests.current.set(name, request);
    try {
      const result = await window.workbench.readFile(target.id, name);
      if (scope !== generation.current || fileRequests.current.get(name) !== request || savingFiles.current.has(name))
        return;
      if (keepDraft && changedFiles.current.get(name) !== edit) return;
      versions.current[name] = result.version;
      setContents(previous => ({ ...previous, [name]: result.content }));
      setSavedContents(previous => ({ ...previous, [name]: result.content }));
    } finally {
      if (fileRequests.current.get(name) === request) fileRequests.current.delete(name);
    }
  };
  const refreshRemoteDirectories = async (
    target: Workspace,
    scope: number,
    paths: string[],
  ): Promise<WorkspaceNode[]> => {
    let failure: unknown;
    // Parents are cached first. Refreshing them can remove vanished children from the cache.
    for (const path of paths) {
      if (scope !== generation.current) break;
      if (!remoteDirectories.current.has(path)) continue;
      try {
        await loadRemoteDirectory(target, scope, path);
      } catch (error) {
        failure ??= error;
      }
    }
    if (failure) throw failure;
    return [...remoteDirectories.current.values()].flat();
  };
  const saveFile = async (name: string): Promise<void> => {
    const target = currentWorkspace.current;
    const draft = contents[name];
    if (!target || draft === undefined || !isFileDirty(name)) return;
    if (savingFiles.current.has(name))
      throw new Error(english ? 'This file is already being saved.' : '正在保存此文件。');
    const scope = generation.current;
    savingFiles.current.add(name);
    fileRequests.current.delete(name);
    try {
      const result = await window.workbench.writeFile(target.id, name, draft, versions.current[name]);
      if (scope !== generation.current) return;
      versions.current[name] = result.version;
      setSavedContents(previous => ({ ...previous, [name]: result.content }));
    } finally {
      savingFiles.current.delete(name);
    }
  };
  const save = async (): Promise<void> => {
    setWorkspaceError(undefined);
    try {
      await saveFile(file);
    } catch (error) {
      setWorkspaceError(errorMessage(error));
    }
  };
  const reportWorkspaceError = (error: unknown): void => setWorkspaceError(errorMessage(error));
  const reconnectWorkspace = async (): Promise<void> => {
    if (changingWorkspace.current || savingFiles.current.size || runInFlight.current) return;
    changingWorkspace.current = true;
    setWorkspaceError(undefined);
    const scope = generation.current;
    try {
      const next = await window.workbench.reconnect();
      if (scope !== generation.current) return;
      currentWorkspace.current = next;
      setWorkspace(next);
      await Promise.all([
        refreshRuns().catch(error => {
          if (scope === generation.current) setExecutionError(errorMessage(error));
        }),
        (async () => {
          await loadWorkspaceTree(next, scope);
          await refreshRemoteDirectories(next, scope, [...remoteDirectories.current.keys()].filter(Boolean));
          const openFiles = contentTabs.filter(tab => tab.kind === 'file' && !isFileDirty(tab.resource));
          await Promise.all(openFiles.map(tab => readFile(next, tab.resource, scope, true)));
        })(),
      ]);
    } finally {
      changingWorkspace.current = false;
    }
  };
  const selectFile = async (nextFile: string): Promise<void> => {
    const target = currentWorkspace.current;
    if (!target || changingWorkspace.current) return;
    const scope = generation.current;
    const selected = Symbol();
    selection.current = selected;
    setWorkspaceError(undefined);
    try {
      if (
        !Object.prototype.hasOwnProperty.call(contents, nextFile) ||
        (target.kind === 'ssh' && target.connected && !isFileDirty(nextFile))
      ) {
        await readFile(target, nextFile, scope, true);
      }
      if (scope === generation.current && selection.current === selected)
        openContentTab({ kind: 'file', resource: nextFile });
    } catch (error) {
      if (scope === generation.current) reportWorkspaceError(error);
    }
  };
  const expandRemoteDirectory = (path: string): void => {
    const target = currentWorkspace.current;
    if (target?.kind !== 'ssh' || !target.connected || remoteDirectories.current.has(path)) return;
    const scope = generation.current;
    void loadRemoteDirectory(target, scope, path).catch(error => {
      if (scope === generation.current) reportWorkspaceError(error);
    });
  };
  syncRemoteFiles.current = async (id, change) => {
    const target = currentWorkspace.current;
    if (target?.kind !== 'ssh' || !target.connected || target.id !== id) return;
    const scope = generation.current;
    const candidates = (change.paths ?? Object.keys(contents))
      .filter(
        name =>
          Object.prototype.hasOwnProperty.call(contents, name) &&
          !isFileDirty(name) &&
          !savingFiles.current.has(name),
      )
      .map(name => ({ name, edit: changedFiles.current.get(name) }));
    const changedDirectories = change.paths && new Set(change.paths.map(parentDirectory));
    const nodes = change.tree
      ? await refreshRemoteDirectories(
          target,
          scope,
          [...remoteDirectories.current.keys()].filter(path => !changedDirectories || changedDirectories.has(path)),
        )
      : undefined;
    if (scope !== generation.current) return;
    const existing = nodes && new Set(nodes.filter(node => node.type === 'file').map(node => node.path));
    await Promise.all(
      candidates
        .filter(
          ({ name, edit }) =>
            (!existing || existing.has(name)) &&
            changedFiles.current.get(name) === edit &&
            !savingFiles.current.has(name),
        )
        .map(({ name }) => readFile(target, name, scope, true)),
    );
  };
  useEffect(() => {
    let pending: { id: string; tree: boolean; paths: Set<string> | null } | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let running = false;
    const schedule = (): void => {
      if (running || timer || !pending) return;
      timer = setTimeout(() => {
        timer = undefined;
        const batch = pending;
        pending = undefined;
        if (!batch) return;
        const scope = generation.current;
        running = true;
        void syncRemoteFiles
          .current?.(batch.id, { tree: batch.tree, paths: batch.paths && [...batch.paths] })
          .catch(error => {
            if (scope === generation.current) reportWorkspaceError(error);
          })
          .finally(() => {
            running = false;
            schedule();
          });
      }, 150);
    };
    const enqueue = (id: string, change: WorkspaceFileChange): void => {
      if (currentWorkspace.current?.id !== id) return;
      if (pending?.id !== id) pending = { id, tree: false, paths: new Set() };
      pending.tree ||= change.tree;
      if (change.paths === null) pending.paths = null;
      else for (const path of change.paths) pending.paths?.add(path);
      schedule();
    };
    queueFileSync.current = enqueue;
    const unsubscribe = window.workbench.onFilesChanged(enqueue);
    return () => {
      clearTimeout(timer);
      pending = undefined;
      queueFileSync.current = undefined;
      unsubscribe();
    };
  }, []);
  const finishFileClose = async (saveChanges: boolean): Promise<void> => {
    const path = pendingClosePath;
    if (!path || savingBeforeClose) return;
    if (saveChanges) {
      setSavingBeforeClose(true);
      setCloseSaveError(false);
      try {
        await saveFile(path);
      } catch {
        setCloseSaveError(true);
        return;
      } finally {
        setSavingBeforeClose(false);
      }
    } else {
      setContents(previous => ({ ...previous, [path]: savedContents[path] }));
    }
    closeContentTab({ kind: 'file', resource: path });
    saveChangesDialog.current?.close();
  };
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
    if (!workspace) return;
    if (changingWorkspace.current || runInFlight.current || disconnected || reviewRuns) return;
    const scope = generation.current;
    runInFlight.current = true;
    setStartingRun(true);
    let submitted = false;
    setExecutionError(undefined);
    let created: Run;
    try {
      if (runtime === 'session') {
        if (!sessionPrompt.trim()) {
          setExecutionError('会话模式需要填写提示词');
          return;
        }
        if (!selectedModel) {
          setExecutionError(sessionModelPlaceholder);
          return;
        }
        const parsedMaxIterations = Number.parseInt(sessionMaxIterations, 10);
        submitted = true;
        created = await client.createRun({
          workflowId: '',
          workspacePath: workspace.root,
          workspaceId: workspace.id,
          runtime,
          prompt: sessionPrompt,
          sessionRuntime,
          model: selectedModel.model,
          providerIndex: selectedModel.providerIndex,
          ...(sessionSystemPrompt.trim() ? { systemPrompt: sessionSystemPrompt.trim() } : {}),
          ...(Number.isInteger(parsedMaxIterations) && parsedMaxIterations >= 1
            ? { maxIterations: parsedMaxIterations }
            : {}),
          reviewerEnabled: sessionReviewerEnabled,
        });
      } else {
        const programPath = runProgramPath.trim() || defaultProgramPath;
        const relativeProgram = programPath.startsWith(workspace.root + '/')
          ? programPath.slice(workspace.root.length + 1)
          : programPath;
        if (relativeProgram) await saveFile(relativeProgram);
        const variables = Object.fromEntries(
          graphVariables.filter(row => row.key.trim()).map(row => [row.key.trim(), row.value]),
        );
        const params: GraphRunParams = { ...graphOptions };
        if (Object.keys(variables).length) params.variables = JSON.stringify(variables);
        if (runPrompt.trim()) params.starting_prompt = runPrompt.trim();
        if (graphOptions.runtime && selectedModel) {
          params.model = selectedModel.model;
          params.provider_index = selectedModel.providerIndex;
        }
        const parsedMaxParallel = Number.parseInt(maxParallel, 10);
        submitted = true;
        created = await client.createRun({
          workflowId: file,
          programPath: remote ? relativeProgram : programPath,
          format: GRAPH_WORKFLOW_FORMAT,
          workspacePath: workspace.root,
          workspaceId: workspace.id,
          content,
          runtime,
          label: runLabel.trim() || programPath.split('/').pop(),
          ...(Object.keys(params).length > 0 ? { params } : {}),
          ...(Number.isInteger(parsedMaxParallel) && parsedMaxParallel >= 1
            ? { maxParallel: parsedMaxParallel }
            : {}),
        });
      }
    } catch (error) {
      if (scope === generation.current) {
        setExecutionError(errorMessage(error));
        if (remote && submitted && errorMessage(error).includes('AXCOR_RUN_UNCERTAIN')) {
          setReviewRuns(true);
          setExecutionError(remoteCopy.checkRuns);
          await refreshRuns().catch(() => {});
        }
      }
      return;
    } finally {
      runInFlight.current = false;
      setStartingRun(false);
    }
    if (scope !== generation.current) return;
    setRuns(previous => [created, ...previous.filter(run => run.id !== created.id)]);
    setEventsByRun(previous => ({ ...previous, [created.id]: [] }));
    setActiveNavigation('runs');
    openContentTab({ kind: 'run', resource: created.id });
    setLayout(previous => (previous.sidebarVisible ? previous : toggleWorkbenchPart(previous, 'sidebar')));
  };
  const refreshRunAfterAction = async (id: string, scope: number): Promise<void> => {
    // The event subscription can still refresh the run if this read fails.
    if (scope !== generation.current) return;
    const latest = await client.getRun(id).catch(() => undefined);
    if (latest && scope === generation.current)
      setRuns(previous => previous.map(item => (item.id === latest.id ? latest : item)));
  };
  const openInsightForRun = async (run: Run): Promise<void> => {
    if (disconnected || openingInsight || changingWorkspace.current) return;
    const scope = generation.current;
    setExecutionError(undefined);
    setOpeningInsight(true);
    try {
      let sessionId = run.id;
      if (run.runtimeId !== 'session') {
        const sessions = await window.executionBackend.getRunSessions(run.id);
        if (scope !== generation.current) return;
        const target = sessions.find(session => session.role === 'executor') ?? sessions[0];
        if (!target) {
          setExecutionError(t.noObservableSessions);
          return;
        }
        sessionId = target.session_id;
      }
      const result = await window.executionBackend.importToInsight(sessionId);
      if (scope !== generation.current) return;
      if (!result.ok) {
        setExecutionError(result.error ?? t.insightLoadFailed);
        return;
      }
      const directPath = result.insightUrl?.replace(/^\/insight(?=\/)/, '');
      setInsightPath(
        directPath && /^\/(run|session)\//.test(directPath)
          ? directPath
          : '/session/' + encodeURIComponent(result.sessionId ?? sessionId),
      );
      openContentTab(insightTab);
    } catch (error) {
      if (scope === generation.current) setExecutionError(errorMessage(error));
    } finally {
      if (scope === generation.current) setOpeningInsight(false);
    }
  };

  const reviewRunList = async (): Promise<void> => {
    await refreshRuns();
    setReviewRuns(false);
    setExecutionError(undefined);
  };
  const showSidebar = layout.sidebarVisible && !insightFromRail;
  const activeRail = settingsOpen ? 'settings' : insightFromRail ? 'insight' : showSidebar ? activeNavigation : '';
  return (
    <main
      className="app-shell"
      onKeyDownCapture={event => {
        if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== 's')
          return;
        event.preventDefault();
        if (
          activeTab?.kind !== 'file' ||
          settingsOpen ||
          pendingClosePath ||
          event.repeat ||
          savingFiles.current.has(file)
        )
          return;
        void save();
      }}
    >
      <header className="topbar">
        <div className="topbar-navigation">
          <button className="icon-button" type="button" aria-label={t.back} title={t.back}>
            ‹
          </button>
          <button className="icon-button" type="button" aria-label={t.forward} title={t.forward}>
            ›
          </button>
          <button className="quick-search" type="button">
            {t.search}
          </button>
        </div>
        <div className="topbar-actions">
          <div className="workspace-remote-actions">
            {disconnected && workspace.kind === 'ssh' && (
              <button
                type="button"
                onClick={() => {
                  void reconnectWorkspace().catch(reportWorkspaceError);
                }}
              >
                {remoteCopy.reconnect}
              </button>
            )}
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={() => setLayout(previous => toggleWorkbenchPart(previous, 'sidebar'))}
            aria-label={t.toggleSidebar}
            title={t.toggleSidebar}
          >
            <span className="sidebar-toggle-icon" aria-hidden="true" />
          </button>
        </div>
      </header>
      <div
        className="left-workbench"
        data-sidebar-open={showSidebar}
        style={showSidebar ? { gridTemplateColumns: `var(--rail-width) ${explorerWidth}px 4px` } : undefined}
      >
        <NavigationRail active={activeRail} onSelect={navigate} messages={t} />
        {showSidebar && activeNavigation === 'workbench' && (
          <WorkspaceExplorer
            key={workspace?.id}
            hasWorkspace={Boolean(workspace)}
            workspacePath={remote ? undefined : workspace?.root}
            tree={tree}
            activeFile={file}
            onSelect={selectFile}
            messages={t}
            onExpand={remote ? expandRemoteDirectory : undefined}
            syncLabel={remoteCopy.sync}
            onSync={
              remote && !disconnected
                ? () => {
                    setWorkspaceError(undefined);
                    queueFileSync.current?.(workspace.id, { tree: true, paths: null });
                  }
                : undefined
            }
          />
        )}
        {showSidebar && activeNavigation === 'runs' && (
          <RunsList
            runs={runs}
            selectedRunId={selectedRunId}
            error={executionError}
            onSelectRun={id => openContentTab({ kind: 'run', resource: id })}
            onRun={startRun}
            runDisabled={!workspace || disconnected || startingRun || reviewRuns}
            runtime={runtime}
            onRuntimeChange={setRuntime}
            runLabel={runLabel}
            onRunLabelChange={setRunLabel}
            runProgramPath={runProgramPath}
            defaultProgramPath={defaultProgramPath}
            onRunProgramPathChange={setRunProgramPath}
            graphVariables={graphVariables}
            onGraphVariablesChange={setGraphVariables}
            graphOptions={graphOptions}
            onGraphOptionsChange={changeGraphOptions}
            maxParallel={maxParallel}
            onMaxParallelChange={setMaxParallel}
            runPrompt={runPrompt}
            onRunPromptChange={setRunPrompt}
            sessionPrompt={sessionPrompt}
            onSessionPromptChange={setSessionPrompt}
            sessionRuntime={sessionRuntime}
            onSessionRuntimeChange={changeSessionRuntime}
            sessionModel={selectedModel?.model ?? ''}
            sessionModels={sessionModelOptions}
            sessionModelPlaceholder={sessionModelPlaceholder}
            onSessionModelChange={runtime === 'workflow' ? setGraphModel : setSessionModel}
            sessionSystemPrompt={sessionSystemPrompt}
            onSessionSystemPromptChange={setSessionSystemPrompt}
            sessionMaxIterations={sessionMaxIterations}
            onSessionMaxIterationsChange={setSessionMaxIterations}
            sessionReviewerEnabled={sessionReviewerEnabled}
            onSessionReviewerEnabledChange={setSessionReviewerEnabled}
            messages={t}
          />
        )}
        {showSidebar && (
          <ResizeHandle
            direction="horizontal"
            onResize={delta => setExplorerWidth(Math.max(180, Math.min(360, explorerWidth + delta)))}
          />
        )}
      </div>
      <section className="app-content" aria-label={t.workbench}>
        {workspaceError && (
          <p className="workspace-error" role="alert">
            {workspaceError}
          </p>
        )}
        {reviewRuns && (
          <button
            type="button"
            onClick={() => void reviewRunList().catch(error => setExecutionError(errorMessage(error)))}
          >
            {remoteCopy.reviewRuns}
          </button>
        )}
        {contentTabs.length > 0 && (
          <div className="content-tabs" role="tablist" aria-label={t.openTabs}>
            {contentTabs.map(tab => {
              const key = tabKey(tab);
              const run = tab.kind === 'run' ? runs.find(item => item.id === tab.resource) : undefined;
              const label =
                tab.kind === 'file'
                  ? fileName(tab.resource)
                  : tab.kind === 'run'
                    ? (run?.workflowId ?? tab.resource)
                    : t.insight;
              const title = tab.kind === 'file' ? tab.resource : run ? `${label} · ${run.id}` : label;
              const selected = key === activeTabKey;
              const dirty = tab.kind === 'file' && isFileDirty(tab.resource);
              return (
                <div className={'content-tab' + (selected ? ' active' : '')} key={key}>
                  <button
                    className="content-tab-label"
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    aria-description={dirty ? t.unsavedChanges : undefined}
                    title={title}
                    onClick={() => activateTab(tab)}
                  >
                    <span className={`content-tab-icon icon-${tab.kind}`} aria-hidden="true">
                      {tab.kind === 'file' ? '≡' : tab.kind === 'run' ? '▶' : '◉'}
                    </span>
                    <span className="content-tab-name">{label}</span>
                  </button>
                  <button
                    type="button"
                    className="content-tab-close"
                    data-dirty={dirty || undefined}
                    aria-label={t.closeTab(label)}
                    onClick={() => requestCloseTab(tab)}
                  >
                    <span aria-hidden="true">×</span>
                  </button>
                </div>
              );
            })}
          </div>
        )}
        <div className="content-panels">
          {file && (
            <section
              hidden={activeTab?.kind !== 'file'}
              className="workspace-grid"
              role="tabpanel"
              aria-label={fileName(file)}
            >
              <div className={'editor-groups split-' + splitDirection}>
                <MonacoEditor
                  activeFile={file}
                  content={content}
                  onChange={updateEditorContent}
                  splitDirection={splitDirection}
                  onSplit={splitEditor}
                  colorScheme={selectedTheme.colorScheme}
                  tokens={selectedTheme.tokens}
                  fontFamily={selectedFont.family}
                  messages={t}
                />
                {splitDirection !== 'none' && (
                  <MonacoEditor
                    activeFile={file}
                    content={content}
                    onChange={updateEditorContent}
                    splitDirection={splitDirection}
                    onSplit={splitEditor}
                    showSplitActions={false}
                    colorScheme={selectedTheme.colorScheme}
                    tokens={selectedTheme.tokens}
                    fontFamily={selectedFont.family}
                    messages={t}
                  />
                )}
              </div>
            </section>
          )}
          {contentTabs
            .filter(tab => tab.kind === 'run')
            .map(tab => {
              const run = runs.find(item => item.id === tab.resource);
              if (!run) return null;
              return (
                <section
                  key={tab.resource}
                  hidden={activeTabKey !== tabKey(tab)}
                  className="single-panel"
                  role="tabpanel"
                  aria-label={run.workflowId}
                >
                  <RunDetail
                    offline={disconnected}
                    openingInsight={openingInsight}
                    run={run}
                    events={eventsByRun[run.id] ?? []}
                    onOpenInsight={disconnected ? undefined : () => openInsightForRun(run)}
                    onStop={async () => {
                      if (disconnected || changingWorkspace.current) return;
                      const scope = generation.current;
                      try {
                        await client.stopRun(run.id);
                        await refreshRunAfterAction(run.id, scope);
                      } catch (error) {
                        if (scope === generation.current) reportWorkspaceError(error);
                      }
                    }}
                    onSetPaused={async paused => {
                      if (changingWorkspace.current)
                        throw new Error(english ? 'Workspace is changing.' : '正在切换工作区。');
                      const scope = generation.current;
                      await client.setSessionPaused(run.id, paused);
                      await refreshRunAfterAction(run.id, scope);
                    }}
                    onSendReply={text => {
                      if (changingWorkspace.current)
                        return Promise.reject(new Error(english ? 'Workspace is changing.' : '正在切换工作区。'));
                      return client.sendSessionReply(run.id, text);
                    }}
                    messages={t}
                  />
                </section>
              );
            })}
          {activeTab?.kind === 'insight' && (
            <section ref={appContent} role="tabpanel" aria-label={t.insight} className="insight-pane">
              <span className="empty-icon">◉</span>
              <strong>{t.insight}</strong>
              <p>
                {disconnected
                  ? remoteCopy.disconnected
                  : insightFailed
                    ? remote
                      ? insightFailed
                      : t.insightLoadFailed
                    : t.insightHint}
              </p>
              {insightFailed && !disconnected && (
                <button type="button" onClick={() => setInsightRetry(value => value + 1)}>
                  {remoteCopy.retryInsight}
                </button>
              )}
            </section>
          )}
          {(!activeTab || (activeTab.kind === 'run' && !runs.some(run => run.id === activeTab.resource))) && (
            <section className={activeNavigation === 'runs' ? 'single-panel' : 'workspace-grid'}>
              <div className="empty-panel">
                {activeNavigation === 'runs' && (
                  <div className="empty-state">
                    <span className="empty-icon">▶</span>
                    <strong>{t.selectRun}</strong>
                    <p>{t.selectRunHint}</p>
                  </div>
                )}
                {activeNavigation === 'workbench' && showSidebar && tree.length > 0 && !backgroundImage && (
                  <div className="workspace-empty-hint">
                    <span className="workspace-glyph" aria-hidden="true">
                      &#xea7b;
                    </span>
                    <p>{t.openFileHint}</p>
                  </div>
                )}
              </div>
            </section>
          )}
        </div>
      </section>
      <footer className="status-bar">
        <span className="status-live">
          <i aria-hidden="true" />
          {workspace?.kind === 'ssh'
            ? (disconnected ? remoteCopy.disconnected : 'SSH') + ' · ' + workspace.config.host + ':' + workspace.root
            : workspace
              ? t.workspaceReady
              : t.noWorkspace}
        </span>
        {file && (
          <>
            <span>{file}</span>
            <span>UTF-8</span>
            <span>LF</span>
            <span>{t.markdown}</span>
          </>
        )}
      </footer>
      <dialog
        className="workbench-dialog"
        ref={saveChangesDialog}
        aria-labelledby="save-changes-title"
        aria-describedby="save-changes-message"
        onClose={() => setPendingClosePath(undefined)}
        onCancel={event => {
          if (savingBeforeClose) event.preventDefault();
        }}
      >
        <h2 id="save-changes-title">{t.saveChangesTitle(fileName(pendingClosePath ?? ''))}</h2>
        <p id="save-changes-message">{t.saveChangesMessage}</p>
        {closeSaveError && <p role="alert">{t.saveFileFailed}</p>}
        <div className="workbench-dialog-actions">
          <button
            className="secondary-button"
            type="button"
            disabled={savingBeforeClose}
            onClick={() => saveChangesDialog.current?.close()}
          >
            {t.cancel}
          </button>
          <button
            className="secondary-button"
            type="button"
            disabled={savingBeforeClose}
            onClick={() => void finishFileClose(false)}
          >
            {t.dontSave}
          </button>
          <button
            className="primary-button"
            type="button"
            disabled={savingBeforeClose}
            onClick={() => void finishFileClose(true)}
          >
            {t.save}
          </button>
        </div>
      </dialog>
      {settingsOpen && (
        <SettingsModal
          theme={theme}
          font={font}
          locale={locale}
          backgroundImage={backgroundImage}
          backgroundFit={backgroundFit}
          onBackgroundImageChange={setBackgroundImage}
          onBackgroundFitChange={setBackgroundFit}
          onThemeChange={setTheme}
          onFontChange={setFont}
          onLocaleChange={setLocale}
          onClose={() => setSettingsOpen(false)}
          messages={t}
        />
      )}
    </main>
  );
}
