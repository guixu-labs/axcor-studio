import { useEffect, useRef, useState } from 'react';
import { EXECUTION_BACKEND_NAME } from '../shared/executionBackendConfig';
import { initialStartupState, type StartupChoice, type StartupService } from '../shared/startup';
import { messages, type LocaleId } from './i18n';
import { REMOTE_WORKSPACE_KEY, RemoteWorkspaceForm, remoteWorkspaceCopy } from './components/RemoteWorkspaceForm';
import './remote-workspace.css';
import { loadWorkbenchState, saveWorkbenchState } from './workbench/storage';
import './startup.css';

export function StartupScreen(): JSX.Element {
  const remoteDialog = useRef<HTMLDialogElement>(null);
  const [remoteFormOpen, setRemoteFormOpen] = useState(false);
  const [choice, setChoice] = useState<StartupChoice>();
  const [workspaceLabel, setWorkspaceLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState(initialStartupState);
  const [requestError, setRequestError] = useState('');
  const locale = loadWorkbenchState<LocaleId>('workbench.locale', 'zh-CN');
  const english = locale === 'en-US';
  const remoteCopy = remoteWorkspaceCopy(english);
  const localLabel = messages[locale].openLocalWorkspace;
  const copy = english ? {
    choose: 'Choose a workspace', localHint: 'Choose a folder on this device', remoteHint: 'Connect to a server over SSH', title: 'Starting workbench', blockedTitle: 'Workbench startup blocked', loadingTitle: 'Loading workbench',
    checking: 'Checking', starting: 'Waiting for service', ready: 'Ready', failed: 'Failed', blocked: 'Waiting for Controller',
    reasons: {
      'missing-command': 'Command or interpreter not found. Check installation and PATH',
      'launch-error': 'Could not start the process', exited: 'Process exited during startup',
      timeout: 'Service did not become ready in time', unreachable: 'Configured service is unreachable',
      occupied: 'Port is already in use',
    },
    retry: 'Retry', close: 'Close startup window',
  } : {
    choose: '选择工作区', localHint: '选择本机文件夹', remoteHint: '通过 SSH 连接服务器', title: '正在启动工作台', blockedTitle: '工作台启动失败', loadingTitle: '正在加载工作台',
    checking: '正在检查', starting: '等待服务就绪', ready: '已就绪', failed: '启动失败', blocked: '等待 Controller',
    reasons: {
      'missing-command': '找不到启动命令或解释器，请检查安装和 PATH',
      'launch-error': '无法启动进程', exited: '进程在启动时退出',
      timeout: '服务未在规定时间内就绪', unreachable: '无法连接已配置的服务',
      occupied: '端口已被占用',
    },
    retry: '重试', close: '关闭启动窗口',
  };

  const run = async (selected: StartupChoice, retry?: StartupService): Promise<void> => {
    setChoice(selected);
    setBusy(true);
    setRequestError('');
    setState(previous => retry ? { ...previous, [retry]: { phase: 'checking' } } : initialStartupState());
    try {
      const result = await window.startup.run(selected, retry);
      setState(result);
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  const chooseLocal = async (): Promise<void> => {
    setBusy(true);
    try {
      const root = await window.startup.chooseLocal();
      if (root) {
        setWorkspaceLabel(root);
        await run({ kind: 'local' });
      }
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const unsubscribe = window.startup.onProgress(setState);
    const unsubscribeFailure = window.startup.onWorkbenchFailed(setRequestError);
    return () => {
      unsubscribe();
      unsubscribeFailure();
    };
  }, []);

  const services: [StartupService, string][] = [
    ['execution', EXECUTION_BACKEND_NAME],
    ['insight', 'Context Insight'],
  ];
  const readyCount = services.filter(([service]) => state[service].phase === 'ready').length;
  const ready = readyCount === services.length;
  const failed = Boolean(requestError) || services.some(([service]) => state[service].phase === 'failed');
  const title = !choice ? copy.choose : failed ? copy.blockedTitle : ready ? copy.loadingTitle : copy.title;
  return (
    <main className="startup-screen" aria-labelledby="startup-title">
      <button className="startup-close" type="button" aria-label={copy.close} onClick={() => window.close()}>×</button>
      <div className="startup-brand">
        <h1 id="startup-title">Axcor Studio</h1>
      </div>
      <div className="startup-body">
        <div className="startup-heading"><h2>{title}</h2>{choice && <span>{readyCount} / {services.length}</span>}</div>
        {workspaceLabel && <p className="startup-workspace-path" title={workspaceLabel}>{workspaceLabel}</p>}
        {!choice && <div className="startup-workspace-actions">
          <button className="startup-workspace-card" type="button" aria-label={localLabel} disabled={busy} onClick={() => void chooseLocal()}>
            <span className="startup-workspace-icon" data-icon="folder" aria-hidden="true"><i /></span>
            <span className="startup-workspace-copy"><strong>{localLabel}</strong><small>{copy.localHint}</small></span>
            <span className="startup-workspace-arrow" aria-hidden="true">›</span>
          </button>
          <button className="startup-workspace-card" type="button" aria-label={remoteCopy.open} disabled={busy} onClick={() => {
            setRemoteFormOpen(true);
            remoteDialog.current?.showModal();
          }}>
            <span className="startup-workspace-icon" data-icon="terminal" aria-hidden="true"><i /></span>
            <span className="startup-workspace-copy"><strong>{remoteCopy.open}</strong><small>{copy.remoteHint}</small></span>
            <span className="startup-workspace-arrow" aria-hidden="true">›</span>
          </button>
        </div>}
        {choice && <ul className="startup-services" aria-live="polite">
          {services.map(([service, name]) => {
            const status = state[service];
            return <li key={service} data-phase={status.phase}>
              <span className="startup-indicator" aria-hidden="true" />
              <span>{name}</span>
              <span className="startup-service-actions">
                <span className="startup-phase">{copy[status.phase]}</span>
                {status.phase === 'failed' && <button className="startup-retry" type="button"
                  aria-label={`${copy.retry} ${name}`} disabled={busy} onClick={() => void run(choice, service)}>{copy.retry}</button>}
              </span>
              {(status.reason || status.detail) && <small>{[status.reason && copy.reasons[status.reason], status.detail].filter(Boolean).join(' · ')}</small>}
            </li>;
          })}
        </ul>}
        {requestError && <div className="startup-request-error">
          <p className="startup-error" role="alert">{requestError}</p>
          {choice && <button className="startup-retry" type="button" disabled={busy} onClick={() => void run(choice)}>{copy.retry}</button>}
        </div>}
      </div>
      <dialog ref={remoteDialog} className="workbench-dialog startup-remote-dialog" aria-label={remoteCopy.open}
        onClose={() => setRemoteFormOpen(false)}>
        {remoteFormOpen && <RemoteWorkspaceForm english={english} onCancel={() => remoteDialog.current?.close()} onConnect={async config => {
          remoteDialog.current?.close();
          setWorkspaceLabel(config.host + ':' + config.root);
          saveWorkbenchState(REMOTE_WORKSPACE_KEY, config);
          await run({ kind: 'ssh', config });
        }} />}
      </dialog>
      {choice && <progress className="startup-progress" max={services.length} value={readyCount} aria-label={copy.title} />}
    </main>
  );
}
