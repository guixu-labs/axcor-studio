import { dialog, ipcMain, type WebContents } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import { stopAllExecutionPolls } from './executionBackend/events';
import { setRemoteBackend } from './executionBackend/http';
import type { CreateRunInput } from './shared/protocol';
import { DEFAULT_REMOTE_INSIGHT_PORT, type RemoteWorkspaceConfig, type SshHostEntry, type Workspace, type WorkspaceFile } from './shared/workspace';
import { hideInsight, localInsightTarget, type InsightTarget } from './observability/insightView';
import { listSshHosts, saveSshHost } from './sshConfig';
import { SshWorkspace, validateRemoteConfig } from './sshWorkspace';
import { walkWorkspace, type WorkspaceNode } from './workspaceFiles';

function localWorkspace(root: string): Workspace {
  return { kind: 'local', id: 'local:' + root, root };
}

export class WorkspaceManager {
  private current?: Workspace;
  private locked = false;
  private ssh?: SshWorkspace;
  private changing = false;
  private closed = false;
  private connectionAttempt = 0;

  constructor(private readonly notifyDisconnect: (id: string) => void) {}

  get workspace(): Workspace | undefined { return this.current; }

  private assertCurrent(id: string): Workspace {
    if (this.current?.id !== id) throw new Error('The active workspace changed.');
    return this.current;
  }

  private localPath(root: string, file: string): string {
    const candidate = path.resolve(root, file);
    const relative = path.relative(root, candidate);
    if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) {
      throw new Error('File is outside the selected workspace.');
    }
    return candidate;
  }

  private async change<T>(action: () => Promise<T>): Promise<T> {
    if (this.changing || this.closed) throw new Error('Workspace connection is busy.');
    this.changing = true;
    try { return await action(); }
    finally { this.changing = false; }
  }

  choose(): Promise<Workspace | undefined> {
    return this.change(async () => {
      if (this.locked) throw new Error('The workspace is fixed for this window.');
      const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
      const root = result.canceled ? undefined : result.filePaths[0];
      if (!root || this.closed) return undefined;
      const next = localWorkspace(root);
      const switched = this.current?.id !== next.id;
      if (switched) {
        const previous = this.ssh;
        this.ssh = undefined;
        this.current = next;
        stopAllExecutionPolls();
        hideInsight();
        setRemoteBackend(false, undefined, true);
        previous?.close();
      }
      return next;
    });
  }

  connect(input: RemoteWorkspaceConfig, onStarting?: () => void): Promise<Workspace> {
    return this.change(async () => {
      const attempt = ++this.connectionAttempt;
      const config = validateRemoteConfig(input);
      const id = 'ssh:' + JSON.stringify([config.host, config.root, config.controllerPort, config.insightPort ?? DEFAULT_REMOTE_INSIGHT_PORT, config.sshPort]);
      if (this.locked && this.current?.id !== id) throw new Error('The workspace is fixed for this window.');
      const session = await SshWorkspace.connect(config, disconnected => {
        if (this.ssh !== disconnected) return;
        this.ssh = undefined;
        this.current = { kind: 'ssh', id, root: config.root, config, connected: false };
        setRemoteBackend(true);
        hideInsight();
        this.notifyDisconnect(id);
      }, onStarting);
      if (this.closed || attempt !== this.connectionAttempt) {
        session.close();
        throw new Error('Workbench is closing.');
      }
      const switched = this.current?.id !== id;
      const previous = this.ssh;
      this.ssh = session;
      this.current = { kind: 'ssh', id, root: config.root, config, connected: true };
      if (switched) stopAllExecutionPolls();
      hideInsight();
      setRemoteBackend(true, session.url, switched);
      previous?.close();
      return this.current;
    });
  }

  private async remote<T>(id: string, action: string, fields?: Record<string, unknown>): Promise<T> {
    const session = this.ssh;
    if (!session?.connected) throw new Error('SSH workspace is disconnected. Reconnect and retry.');
    const result = await session.request<T>(action, fields);
    this.assertCurrent(id);
    if (session !== this.ssh) throw new Error('SSH connection changed. Retry the operation.');
    return result;
  }

  async list(id: string): Promise<WorkspaceNode[]> {
    const workspace = this.assertCurrent(id);
    if (workspace.kind === 'ssh') return this.remote(id, 'list');
    return walkWorkspace(workspace.root);
  }

  async read(id: string, file: string): Promise<WorkspaceFile> {
    const workspace = this.assertCurrent(id);
    if (workspace.kind === 'ssh') return this.remote(id, 'read', { path: file });
    return { content: await fs.readFile(this.localPath(workspace.root, file), 'utf8') };
  }

  async write(id: string, file: string, content: string, version?: string): Promise<WorkspaceFile> {
    const workspace = this.assertCurrent(id);
    if (workspace.kind === 'ssh') {
      if (!version) throw new Error('Read the remote file before saving it.');
      if (Buffer.byteLength(content, 'utf8') > 2 * 1024 * 1024) throw new Error('File exceeds the 2 MiB editing limit.');
      return this.remote(id, 'write', { path: file, content, version });
    }
    await fs.writeFile(this.localPath(workspace.root, file), content, 'utf8');
    return { content };
  }

  async prepareRun(input: CreateRunInput): Promise<CreateRunInput> {
    const workspace = input.workspaceId ? this.assertCurrent(input.workspaceId) : this.current;
    if (workspace?.kind !== 'ssh') return input;
    if (!input.workspaceId) throw new Error('A remote workspace ID is required.');
    const programPath = input.runtime === 'workflow'
      ? await this.remote<string>(workspace.id, 'program', { path: input.programPath })
      : undefined;
    const root = await this.remote<string>(workspace.id, 'root');
    return { ...input, workspacePath: root, programPath };
  }

  insightTarget(): InsightTarget {
    const workspace = this.current;
    const session = this.ssh;
    if (workspace?.kind === 'ssh' && !session?.connected) {
      throw new Error('SSH workspace is disconnected. Reconnect to open Context Insight.');
    }
    return {
      url: session?.insightUrl ?? localInsightTarget.url,
      ensureReady: async onStarting => {
        if (session) await session.ensureInsight(onStarting);
        else await localInsightTarget.ensureReady(onStarting);
        if (workspace !== this.current || session !== this.ssh) throw new Error('The active workspace changed.');
      },
    };
  }

  lock(): void { this.locked = true; }
  unlock(): void { this.locked = false; }

  release(): void {
    this.locked = false;
    this.connectionAttempt += 1;
    this.current = undefined;
    hideInsight();
    setRemoteBackend(false, undefined, true);
    const previous = this.ssh;
    this.ssh = undefined;
    previous?.close();
  }

  close(): void {
    this.closed = true;
    this.release();
  }

  register(isWorkbench: (sender: WebContents) => boolean, isStartup: (sender: WebContents) => boolean): void {
    const guard = (event: Electron.IpcMainInvokeEvent): void => {
      if (!isWorkbench(event.sender) || event.senderFrame !== event.sender.mainFrame) throw new Error('Invalid workspace caller.');
    };
    const guardStartup = (event: Electron.IpcMainInvokeEvent): void => {
      if (!isStartup(event.sender) || event.senderFrame !== event.sender.mainFrame) throw new Error('Invalid startup caller.');
    };
    ipcMain.handle('workspace:ssh-hosts', event => { guardStartup(event); return listSshHosts(); });
    ipcMain.handle('workspace:ssh-host-save', (event, entry: SshHostEntry) => { guardStartup(event); return saveSshHost(entry); });
    ipcMain.handle('workspace:reconnect', event => {
      guard(event);
      const current = this.current;
      if (current?.kind !== 'ssh' || current.connected) throw new Error('The SSH workspace is not disconnected.');
      return this.connect(current.config);
    });
    ipcMain.handle('workspace:get', event => { guard(event); return this.workspace; });
    ipcMain.handle('workspace:list-tree', (event, id: string) => { guard(event); return this.list(id); });
    ipcMain.handle('workspace:read-file', (event, id: string, file: string) => { guard(event); return this.read(id, file); });
    ipcMain.handle('workspace:write-file', (event, id: string, file: string, content: string, version?: string) => {
      guard(event);
      return this.write(id, file, content, version);
    });
  }
}
