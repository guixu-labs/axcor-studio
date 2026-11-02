import type { Run, RunEvent } from '../../shared/protocol';

interface RunPanelProps { run?: Run; events: RunEvent[]; onRun: () => void; onCancel: () => void; messages: { executionCenter: string; monitorRuns: string; runWorkflow: string; cancel: string; readyForRun: string; eventsCaptured: (count: number) => string; noRuns: string; runToSeeEvents: string }; }

export function RunPanel({ run, events, onRun, onCancel, messages }: RunPanelProps): JSX.Element {
  const status = run?.status ?? 'idle';
  return <section className="run-panel">
    <div className="run-header"><div><span className="eyebrow">{messages.executionCenter}</span><h1>{messages.executionCenter}</h1><p className="panel-subtitle">{messages.monitorRuns}</p></div><div className="run-actions"><button className="primary-button" type="button" onClick={onRun}>{messages.runWorkflow}</button><button className="secondary-button" type="button" onClick={onCancel} disabled={!run || ['completed', 'cancelled', 'failed'].includes(status)}>{messages.cancel}</button></div></div>
    <div className="run-summary"><div className={'status-badge status-' + status}><i aria-hidden="true" />{status}</div><span>{events.length ? messages.eventsCaptured(events.length) : messages.readyForRun}</span></div>
    <div className="event-list">{events.length ? events.map(event => <div className="event" key={event.id}><span><i className="event-dot" aria-hidden="true" /><b>{event.type}</b></span><small>{new Date(event.timestamp).toLocaleTimeString()}</small></div>) : <div className="empty-state"><span className="empty-icon">✦</span><strong>{messages.noRuns}</strong><p>{messages.runToSeeEvents}</p></div>}</div>
  </section>;
}
