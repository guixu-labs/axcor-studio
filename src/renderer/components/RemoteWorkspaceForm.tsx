import { useEffect, useState } from 'react';
import { DEFAULT_EXECUTION_BACKEND_PORT } from '../../shared/localServicePorts';
import { DEFAULT_REMOTE_INSIGHT_PORT, type RemoteWorkspaceConfig } from '../../shared/workspace';
import { loadWorkbenchState } from '../workbench/storage';

export const REMOTE_WORKSPACE_KEY = 'workbench.remoteWorkspace';

export function remoteWorkspaceCopy(english: boolean) {
  return english
    ? {
        open: 'Open remote workspace',
        host: 'SSH host',
        root: 'Remote directory',
        port: 'Controller port',
        hosts: 'Hosts from SSH config',
        chooseHost: 'Choose a configured host',
        noHosts: 'No configured hosts',
        readHostsFailed: 'Could not read SSH config',
        sshPort: 'SSH port',
        sshPortDefault: 'Use SSH configuration',
        saveHost: 'Save to SSH config',
        alias: 'SSH alias',
        hostSaved: 'Saved to SSH config',
        connect: 'Connect',
        connecting: 'Connecting…',
        reconnect: 'Reconnect',
        cancel: 'Cancel',
        disconnected: 'SSH disconnected',
        sync: 'Sync',
        reviewRuns: 'Refresh and review runs',
        insightPort: 'Remote Insight port',
        retryInsight: 'Retry Insight',
        checkRuns: 'The launch outcome is uncertain. Check the run list before submitting again.',
      }
    : {
        open: '打开远程工作区',
        host: 'SSH 主机',
        root: '远程目录',
        port: 'Controller 端口',
        hosts: 'SSH 配置中的主机',
        chooseHost: '选择已配置的主机',
        noHosts: '暂无已配置的主机',
        readHostsFailed: '无法读取 SSH 配置',
        sshPort: 'SSH 端口',
        sshPortDefault: '使用 SSH 配置',
        saveHost: '保存到 SSH 配置',
        alias: 'SSH 别名',
        hostSaved: '已保存到 SSH 配置',
        connect: '连接',
        connecting: '正在连接…',
        reconnect: '重新连接',
        cancel: '取消',
        disconnected: 'SSH 已断开',
        sync: '同步',
        reviewRuns: '刷新并检查运行列表',
        insightPort: '远程 Insight 端口',
        retryInsight: '重试 Insight',
        checkRuns: '运行提交结果未确认。请先检查运行列表，再决定是否重新提交。',
      };
}

interface Props {
  english: boolean;
  onConnect: (config: RemoteWorkspaceConfig) => Promise<void>;
  onCancel: () => void;
}

export function RemoteWorkspaceForm({ english, onConnect, onCancel }: Props): JSX.Element {
  const [saved] = useState(() =>
    loadWorkbenchState<RemoteWorkspaceConfig | undefined>(REMOTE_WORKSPACE_KEY, undefined),
  );
  const [host, setHost] = useState(saved?.host ?? '');
  const [hosts, setHosts] = useState<string[]>([]);
  const [hostsError, setHostsError] = useState('');
  const [sshPort, setSshPort] = useState(saved?.sshPort?.toString() ?? '');
  const [alias, setAlias] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedAlias, setSavedAlias] = useState('');
  const [root, setRoot] = useState(saved?.root ?? '');
  const [port, setPort] = useState(saved?.controllerPort ?? Number(DEFAULT_EXECUTION_BACKEND_PORT));
  const [insightPort, setInsightPort] = useState(saved?.insightPort ?? DEFAULT_REMOTE_INSIGHT_PORT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const copy = remoteWorkspaceCopy(english);
  const configuredHost = hosts.find(name => name.toLowerCase() === host.trim().toLowerCase());
  const disabled = busy || saving;

  useEffect(() => {
    let active = true;
    void window.workbench
      .listSshHosts()
      .then(result => {
        if (active) setHosts(previous => [...new Set([...result, ...previous])]);
      })
      .catch(reason => {
        if (active) setHostsError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => {
      active = false;
    };
  }, []);

  const changeHost = (value: string): void => {
    setHost(value);
    setSshPort('');
    setAlias('');
    setSavedAlias('');
    setError('');
  };

  const saveHost = async (): Promise<void> => {
    if (disabled) return;
    setSaving(true);
    setError('');
    try {
      const name = await window.workbench.saveSshHost({
        alias,
        destination: host,
        ...(sshPort ? { port: Number(sshPort) } : {}),
      });
      changeHost(name);
      setHosts(previous =>
        [...previous, name].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
      );
      setSavedAlias(name);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className="remote-workspace-form"
      onSubmit={event => {
        event.preventDefault();
        if (disabled) return;
        setBusy(true);
        setError('');
        void onConnect({
          host: configuredHost ?? host,
          root,
          controllerPort: port,
          insightPort,
          ...(!configuredHost && sshPort ? { sshPort: Number(sshPort) } : {}),
        })
          .catch(reason => setError(reason instanceof Error ? reason.message : String(reason)))
          .finally(() => setBusy(false));
      }}
    >
      <label>
        {copy.hosts}
        <select
          value={configuredHost ?? ''}
          disabled={disabled || !hosts.length}
          onChange={event => changeHost(event.currentTarget.value)}
        >
          <option value="">{hosts.length ? copy.chooseHost : copy.noHosts}</option>
          {hosts.map(name => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>
      {hostsError && (
        <p role="status">
          {copy.readHostsFailed} · {hostsError}
        </p>
      )}
      <label>
        {copy.host}
        <input
          required
          value={host}
          placeholder="user@server.example"
          disabled={disabled}
          onChange={event => changeHost(event.currentTarget.value)}
        />
      </label>
      {!configuredHost && (
        <label>
          {copy.sshPort}
          <input
            type="number"
            min="1"
            max="65535"
            value={sshPort}
            placeholder={copy.sshPortDefault}
            disabled={disabled}
            onChange={event => setSshPort(event.currentTarget.value)}
          />
        </label>
      )}
      {!configuredHost && host.trim() && (
        <details className="ssh-save-host">
          <summary>{copy.saveHost}</summary>
          <label>
            {copy.alias}
            <input
              value={alias}
              placeholder="dev-server"
              disabled={disabled}
              onChange={event => setAlias(event.currentTarget.value)}
            />
          </label>
          <button type="button" disabled={disabled || !alias.trim()} onClick={() => void saveHost()}>
            {copy.saveHost}
          </button>
        </details>
      )}
      {savedAlias && (
        <p role="status">
          {copy.hostSaved} · {savedAlias}
        </p>
      )}
      <label>
        {copy.root}
        <input
          required
          value={root}
          placeholder="/home/user/project"
          disabled={disabled}
          onChange={event => setRoot(event.currentTarget.value)}
        />
      </label>
      <label>
        {copy.port}
        <input
          required
          type="number"
          min="1"
          max="65535"
          value={port}
          disabled={disabled}
          onChange={event => setPort(Number(event.currentTarget.value))}
        />
      </label>
      <label>
        {copy.insightPort}
        <input
          required
          type="number"
          min="1"
          max="65535"
          value={insightPort}
          disabled={disabled}
          onChange={event => setInsightPort(Number(event.currentTarget.value))}
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <div className="workbench-dialog-actions">
        <button type="button" disabled={disabled} onClick={onCancel}>
          {copy.cancel}
        </button>
        <button type="submit" disabled={disabled}>
          {busy ? copy.connecting : copy.connect}
        </button>
      </div>
    </form>
  );
}
