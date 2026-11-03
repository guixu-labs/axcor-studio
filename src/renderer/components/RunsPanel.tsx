import type { Run, RunEvent } from '../../shared/protocol';

export interface RunsPanelMessages {
  runs: string; executionCenter: string; monitorRuns: string; runWorkflow: string; cancel: string;
  readyForRun: string; eventsCaptured: (count: number) => string; noRuns: string; runToSeeEvents: string;
  selectRun: string; selectRunHint: string;
}

interface RunsListProps {
  runs: Run[];
  selectedRunId?: string;
  error?: string;
  onSelectRun: (runId: string) => void;
  onRun: () => void;
  messages: RunsPanelMessages;
}

export function RunsList({ runs, selectedRunId, error, onSelectRun, onRun, messages }: RunsListProps): JSX.Element {
  return <aside className="runs-panel">
    <div className="explorer-heading"><div><span className="eyebrow">{messages.runs}</span><h2>{messages.executionCenter}</h2></div></div>
    <div className="run-list" role="listbox" aria-label={messages.executionCenter}>
      {runs.length ? runs.map(run => <button
        className={'run-entry' + (run.id === selectedRunId ? ' active' : '')}
        role="option"
        aria-selected={run.id === selectedRunId}
        key={run.id}
        type="button"
        onClick={() => onSelectRun(run.id)}
      >
        <i className={'run-dot ' + run.status} aria-hidden="true" />
        <span className="run-entry-title">{run.workflowId}</span>
        <small>{new Date(run.createdAt).toLocaleTimeString()}</small>
      </button>) : <div className="run-list-empty"><strong>{messages.noRuns}</strong><p>{messages.runToSeeEvents}</p></div>}
      {error && <p className="run-list-error" role="alert">{error}</p>}
    </div>
    <button className="run-action" type="button" onClick={onRun}><span>{messages.runWorkflow}</span><b>⌘ ↵</b></button>
  </aside>;
}

interface RunDetailProps {
  run: Run;
  events: RunEvent[];
  onCancel: () => void;
  messages: RunsPanelMessages;
}

export function RunDetail({ run, events, onCancel, messages }: RunDetailProps): JSX.Element {
  return <section className="run-detail">
    <header className="run-detail-header">
      <div>
        <span className="eyebrow">{messages.executionCenter}</span>
        <h1>{run.workflowId}</h1>
        <p className="panel-subtitle">{run.id} · {new Date(run.createdAt).toLocaleString()}</p>
      </div>
      <div className="run-actions"><button className="secondary-button" type="button" onClick={onCancel} disabled={['completed', 'cancelled', 'failed'].includes(run.status)}>{messages.cancel}</button></div>
    </header>
    <div className="run-summary"><div className={'status-badge status-' + run.status}><i aria-hidden="true" />{run.status}</div><span>{events.length ? messages.eventsCaptured(events.length) : messages.readyForRun}</span></div>
    <div className="event-list">{events.length ? events.map(event => <div className="event" key={event.id}><span><i className="event-dot" aria-hidden="true" /><b>{event.type}</b></span><small>{new Date(event.timestamp).toLocaleTimeString()}</small></div>) : <div className="empty-state"><span className="empty-icon">✦</span><strong>{messages.noRuns}</strong><p>{messages.runToSeeEvents}</p></div>}</div>
  </section>;
}
