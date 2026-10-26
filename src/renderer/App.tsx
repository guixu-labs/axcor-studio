import { useState } from 'react';
import { MockOpsbotClient } from './services/opsbotClient';
import type { Run, RunEvent } from '../shared/protocol';
import { NavigationRail } from './components/NavigationRail';
import { WorkspaceExplorer } from './components/WorkspaceExplorer';
import { MarkdownEditor } from './components/MarkdownEditor';
import { RunPanel } from './components/RunPanel';
import { EvidencePanel } from './components/EvidencePanel';

const client = new MockOpsbotClient();

export default function App(): JSX.Element {
  const [workspace, setWorkspace] = useState<string>();
  const [file, setFile] = useState('workflow.md');
  const [content, setContent] = useState('# New workflow\n\nDescribe the workflow steps here.');
  const [run, setRun] = useState<Run>();
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [activeNavigation, setActiveNavigation] = useState('workbench');

  const chooseWorkspace = async (): Promise<void> => { const selected = await window.workbench.chooseWorkspace(); if (!selected) return; setWorkspace(selected); const files = await window.workbench.listMarkdownFiles(); if (files[0]) { setFile(files[0]); setContent(await window.workbench.readFile(files[0])); } };
  const save = async (): Promise<void> => { if (workspace) await window.workbench.writeFile(file, content); };
  const startRun = async (): Promise<void> => { const created = await client.createRun({ workflowId: file, workspacePath: workspace, content }); setRun(created); setEvents([]); client.subscribeRunEvents(created.id, event => { setEvents(previous => [...previous, event]); void client.getRun(created.id).then(setRun); }); };

  return <main className="app-shell">
    <NavigationRail active={activeNavigation} onSelect={setActiveNavigation} />
    <div className="app-content">
      <header><strong>Agent Workbench</strong><button onClick={chooseWorkspace}>Open workspace</button><span>{workspace ?? 'No workspace selected'}</span></header>
      <section className="workspace-grid">
        <WorkspaceExplorer file={file} onSelect={setFile} />
        <MarkdownEditor file={file} content={content} onChange={setContent} onSave={save} onRun={startRun} />
        <RunPanel run={run} events={events} />
      </section>
      <EvidencePanel run={run} />
    </div>
  </main>;
}
