import { useEffect, useRef, useState } from 'react';
import { DEFAULT_EXECUTION_BACKEND_PORT } from '../../shared/localServicePorts';
import {
  DEFAULT_REMOTE_INSIGHT_PORT,
  type DockerContainer,
  type RemoteWorkspaceConfig,
} from '../../shared/workspace';
import { loadWorkbenchState } from '../workbench/storage';

export const REMOTE_WORKSPACE_KEY = 'workbench.remoteWorkspace';

export function remoteWorkspaceCopy(english: boolean) {
  return english
    ? {
        open: 'Open remote workspace',
        target: 'Connection type',
        hostTarget: 'SSH host',
        containerTarget: 'Docker container',
        containerDirectory: 'Directory in container',
        loadContainers: 'Load containers',
        loadingContainers: 'Loading…',
        chooseContainer: 'Choose a running container',
        noContainers: 'No running containers',
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
        target: '连接类型',
        hostTarget: 'SSH 主机',
        containerTarget: 'Docker 容器',
        containerDirectory: '容器内目录',
        loadContainers: '加载容器',
        loadingContainers: '加载中…',
        chooseContainer: '选择正在运行的容器',
        noContainers: '没有正在运行的容器',
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
  const [docker, setDocker] = useState(Boolean(saved?.container));
  const [containers, setContainers] = useState<DockerContainer[]>();
  const [containerId, setContainerId] = useState(saved?.container?.id ?? '');
  const [loadingContainers, setLoadingContainers] = useState(false);
  const containerRequest = useRef(0);
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
  const selectedContainer = containers?.find(container => container.id === containerId);
  const target = {
    host: configuredHost ?? host,
    ...(!configuredHost && sshPort ? { sshPort: Number(sshPort) } : {}),
  };

  const resetContainers = (): void => {
    containerRequest.current += 1;
    setContainers(undefined);
    setContainerId('');
    setLoadingContainers(false);
    setError('');
  };

  const loadContainers = async (): Promise<void> => {
    const request = ++containerRequest.current;
    setLoadingContainers(true);
    setContainers(undefined);
    setError('');
    try {
      const result = await window.workbench.listDockerContainers(target);
      if (request === containerRequest.current) setContainers(result);
    } catch (reason) {
      if (request === containerRequest.current) setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      if (request === containerRequest.current) setLoadingContainers(false);
    }
  };

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
      containerRequest.current += 1;
    };
  }, []);

  const changeHost = (value: string): void => {
    setHost(value);
    setSshPort('');
    setAlias('');
    setSavedAlias('');
    resetContainers();
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
        if (disabled || (docker && !selectedContainer)) return;
        setBusy(true);
        setError('');
        void onConnect({
          ...target,
          root,
          controllerPort: port,
          insightPort,
          ...(docker && selectedContainer
            ? { container: { id: selectedContainer.id, name: selectedContainer.name } }
            : {}),
        })
          .catch(reason => setError(reason instanceof Error ? reason.message : String(reason)))
          .finally(() => setBusy(false));
      }}
    >
      <label>
        {copy.target}
        <select
          aria-label={copy.target}
          value={docker ? 'docker' : 'ssh'}
          disabled={disabled}
          onChange={event => {
            setDocker(event.currentTarget.value === 'docker');
            resetContainers();
          }}
        >
          <option value="ssh">{copy.hostTarget}</option>
          <option value="docker">{copy.containerTarget}</option>
        </select>
      </label>
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
            onChange={event => {
              setSshPort(event.currentTarget.value);
              resetContainers();
            }}
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
      {docker && (
        <div className="remote-container-select">
          <label>
            {copy.containerTarget}
            <select
              aria-label={copy.containerTarget}
              value={selectedContainer?.id ?? ''}
              disabled={disabled || loadingContainers || !containers?.length}
              onChange={event => setContainerId(event.currentTarget.value)}
            >
              <option value="">{containers?.length === 0 ? copy.noContainers : copy.chooseContainer}</option>
              {containers?.map(container => (
                <option key={container.id} value={container.id}>
                  {container.name} · {container.image} · {container.id.slice(0, 12)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={disabled || loadingContainers || !target.host.trim()}
            aria-busy={loadingContainers}
            onClick={() => void loadContainers()}
          >
            {loadingContainers ? copy.loadingContainers : copy.loadContainers}
          </button>
        </div>
      )}
      <label>
        {docker ? copy.containerDirectory : copy.root}
        <input
          required
          value={root}
          placeholder="/home/user/project"
          disabled={disabled}
          onChange={event => setRoot(event.currentTarget.value)}
        />
      </label>
      <div className="remote-service-ports">
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
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="workbench-dialog-actions">
        <button type="button" disabled={disabled} onClick={onCancel}>
          {copy.cancel}
        </button>
        <button type="submit" disabled={disabled || (docker && !selectedContainer)}>
          {busy ? copy.connecting : copy.connect}
        </button>
      </div>
    </form>
  );
}
