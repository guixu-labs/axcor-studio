import type { Run, RunEvent } from '../../shared/protocol';

interface RunPanelProps { run?: Run; events: RunEvent[]; onRun: () => void; onCancel: () => void; }

export function RunPanel({ run, events, onRun, onCancel }: RunPanelProps): JSX.Element {
  const status = run?.status ?? 'idle';
  return <section className="run-panel">
    <div className="run-header"><div><span className="eyebrow">Execution center</span><h1>Runs</h1><p className="panel-subtitle">Monitor workflow activity and inspect evidence.</p></div><div className="run-actions"><button className="primary-button" type="button" onClick={onRun}>Run workflow</button><button className="secondary-button" type="button" onClick={onCancel} disabled={!run || ['completed', 'cancelled', 'failed'].includes(status)}>Cancel</button></div></div>
    <div className="run-summary"><div className={'status-badge status-' + status}><i aria-hidden="true" />{status}</div><span>{events.length ? `${events.length} events captured` : 'Ready for a new run'}</span></div>
    <div className="event-list">{events.length ? events.map(event => <div className="event" key={event.id}><span><i className="event-dot" aria-hidden="true" /><b>{event.type}</b></span><small>{new Date(event.timestamp).toLocaleTimeString()}</small></div>) : <div className="empty-state"><span className="empty-icon">✦</span><strong>No runs yet</strong><p>Run your workflow to see live execution events here.</p></div>}</div>
  </section>;
}
