import { useEffect, useState } from 'react';
import { EXECUTION_BACKEND_NAME } from '../shared/executionBackendConfig';
import { initialStartupState, type StartupState } from '../shared/startup';
import type { LocaleId } from './i18n';
import { loadWorkbenchState } from './workbench/storage';
import './startup.css';

export function StartupScreen(): JSX.Element {
  const [state, setState] = useState(initialStartupState);
  const [requestError, setRequestError] = useState('');
  const english = loadWorkbenchState<LocaleId>('workbench.locale', 'zh-CN') === 'en-US';
  const copy = english ? {
    title: 'Starting workbench', blockedTitle: 'Workbench startup blocked', loadingTitle: 'Loading workbench',
    checking: 'Checking', starting: 'Waiting for service', ready: 'Ready', failed: 'Failed',
    retry: 'Retry', close: 'Close startup window',
  } : {
    title: '正在启动工作台', blockedTitle: '工作台启动失败', loadingTitle: '正在加载工作台',
    checking: '正在检查', starting: '等待服务就绪', ready: '已就绪', failed: '启动失败',
    retry: '重试', close: '关闭启动窗口',
  };

  const run = (): void => {
    setRequestError('');
    setState(initialStartupState());
    void window.startup.run().then(setState).catch(error => {
      setRequestError(error instanceof Error ? error.message : String(error));
    });
  };

  useEffect(() => {
    const unsubscribe = window.startup.onProgress(setState);
    const unsubscribeFailure = window.startup.onWorkbenchFailed(setRequestError);
    run();
    return () => {
      unsubscribe();
      unsubscribeFailure();
    };
  }, []);

  const services: [string, StartupState[keyof StartupState]][] = [
    [EXECUTION_BACKEND_NAME, state.execution],
    ['Context Insight', state.insight],
  ];
  const readyCount = services.filter(([, status]) => status.phase === 'ready').length;
  const ready = readyCount === services.length;
  const canRetry = Boolean(requestError) || (!ready && services.every(([, status]) => status.phase === 'ready' || status.phase === 'failed'));
  const title = canRetry ? copy.blockedTitle : ready ? copy.loadingTitle : copy.title;
  return (
    <main className="startup-screen" aria-labelledby="startup-title">
      <button className="startup-close" type="button" aria-label={copy.close} onClick={() => window.close()}>×</button>
      <div className="startup-brand">
        <h1 id="startup-title">Axcor Studio</h1>
      </div>
      <div className="startup-body">
        <div className="startup-heading"><h2>{title}</h2><span>{readyCount} / {services.length}</span></div>
        <ul className="startup-services" aria-live="polite">
          {services.map(([name, status]) => (
            <li key={name} data-phase={status.phase}>
              <span className="startup-indicator" aria-hidden="true" />
              <span>{name}</span>
              <span className="startup-phase">{copy[status.phase]}</span>
              {status.detail && <small>{status.detail}</small>}
            </li>
          ))}
        </ul>
        {requestError && <p className="startup-error" role="alert">{requestError}</p>}
        {canRetry && <div className="startup-retry"><button type="button" onClick={run}>{copy.retry}</button></div>}
      </div>
      <progress className="startup-progress" max={services.length} value={readyCount} aria-label={copy.title} />
    </main>
  );
}
