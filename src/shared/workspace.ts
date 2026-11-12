import type { WorkspaceNode } from '../workspaceFiles';

export const DEFAULT_REMOTE_INSIGHT_PORT = 21025;

export interface RemoteWorkspaceConfig {
  host: string;
  root: string;
  controllerPort: number;
  sshPort?: number;
  insightPort?: number;
}

export interface SshHostEntry {
  alias: string;
  destination: string;
  port?: number;
}

export type Workspace =
  | { kind: 'local'; id: string; root: string }
  | { kind: 'ssh'; id: string; root: string; config: RemoteWorkspaceConfig; connected: boolean };

export interface WorkspaceFile {
  content: string;
  version?: string;
}

export interface WorkspaceFileChange {
  tree: boolean;
  paths: string[] | null;
}

export interface WorkspaceBridge {
  listSshHosts(): Promise<string[]>;
  saveSshHost(entry: SshHostEntry): Promise<string>;
  reconnect(): Promise<Workspace>;
  getWorkspace(): Promise<Workspace | undefined>;
  listTree(id: string, directory?: string): Promise<WorkspaceNode[]>;
  readFile(id: string, file: string): Promise<WorkspaceFile>;
  writeFile(id: string, file: string, content: string, version?: string): Promise<WorkspaceFile>;
  onDisconnected(listener: (id: string) => void): () => void;
  onFilesChanged(listener: (id: string, change: WorkspaceFileChange) => void): () => void;
}
