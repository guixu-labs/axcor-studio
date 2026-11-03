import { useState } from 'react';
import type { Run, RunEvent, RuntimeId } from '../../shared/protocol';
import { RUNTIMES } from '../../shared/protocol';

export interface RunsPanelMessages {
  runs: string; executionCenter: string; monitorRuns: string; runWorkflow: string; cancel: string;
  readyForRun: string; eventsCaptured: (count: number) => string; noRuns: string; runToSeeEvents: string;
  selectRun: string; selectRunHint: string; openInInsight: string;
  runConfig: string; runtime: string; runLabel: string; runLabelPlaceholder: string;
  runParams: string; addParam: string; paramKeyPlaceholder: string; paramValuePlaceholder: string;
  maxParallel: string; removeParam: string;
}

export interface RunParamsRow { key: string; value: string; }

interface RunsListProps {
  runs: Run[];
  selectedRunId?: string;
  error?: string;
  onSelectRun: (runId: string) => void;
  onRun: () => void;
  runtime: RuntimeId;
  onRuntimeChange: (runtime: RuntimeId) => void;
  runLabel: string;
  onRunLabelChange: (value: string) => void;
  runParams: RunParamsRow[];
  onRunParamsChange: (rows: RunParamsRow[]) => void;
  maxParallel: string;
  onMaxParallelChange: (value: string) => void;
  messages: RunsPanelMessages;
}

export function RunsList({ runs, selectedRunId, error, onSelectRun, onRun, runtime, onRuntimeChange, runLabel, onRunLabelChange, runParams, onRunParamsChange, maxParallel, onMaxParallelChange, messages }: RunsListProps): JSX.Element {
  const [configOpen, setConfigOpen] = useState(true);
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
    <div className="run-config">
      <button className="run-config-toggle" type="button" aria-expanded={configOpen} onClick={() => setConfigOpen(open => !open)}>
        <span className="run-config-arrow" aria-hidden="true">{configOpen ? '▾' : '▸'}</span>{messages.runConfig}
      </button>
      {configOpen && <>
        <label className="run-config-field">
          <span className="run-config-title">{messages.runtime}</span>
          <select className="run-config-select" value={runtime} aria-label={messages.runtime} onChange={event => onRuntimeChange(event.target.value as RuntimeId)}>
            {RUNTIMES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <label className="run-config-field">
          <span className="run-config-title">{messages.runLabel}</span>
          <input className="run-config-input" type="text" value={runLabel} placeholder={messages.runLabelPlaceholder} aria-label={messages.runLabel} onChange={event => onRunLabelChange(event.target.value)} />
        </label>
        <div className="run-config-field">
          <span className="run-config-title">{messages.runParams}</span>
          {runParams.map((row, index) => <div className="run-param-row" key={index}>
            <input className="run-config-input" type="text" value={row.key} placeholder={messages.paramKeyPlaceholder} aria-label={messages.paramKeyPlaceholder} onChange={event => onRunParamsChange(runParams.map((item, itemIndex) => itemIndex === index ? { ...item, key: event.target.value } : item))} />
            <input className="run-config-input" type="text" value={row.value} placeholder={messages.paramValuePlaceholder} aria-label={messages.paramValuePlaceholder} onChange={event => onRunParamsChange(runParams.map((item, itemIndex) => itemIndex === index ? { ...item, value: event.target.value } : item))} />
            <button className="run-param-remove" type="button" aria-label={messages.removeParam} onClick={() => onRunParamsChange(runParams.filter((_item, itemIndex) => itemIndex !== index))}>×</button>
          </div>)}
          <button className="text-button run-param-add" type="button" onClick={() => onRunParamsChange([...runParams, { key: '', value: '' }])}>{messages.addParam}</button>
        </div>
        <label className="run-config-field">
          <span className="run-config-title">{messages.maxParallel}</span>
          <input className="run-config-input" type="number" min={1} value={maxParallel} aria-label={messages.maxParallel} onChange={event => onMaxParallelChange(event.target.value)} />
        </label>
      </>}
    </div>
    <button className="run-action" type="button" onClick={onRun}><span>{messages.runWorkflow}</span><b>⌘ ↵</b></button>
  </aside>;
}

interface RunDetailProps {
  run: Run;
  events: RunEvent[];
  onCancel: () => void;
  onOpenInsight: () => void;
  messages: RunsPanelMessages;
}

export function RunDetail({ run, events, onCancel, onOpenInsight, messages }: RunDetailProps): JSX.Element {
  return <section className="run-detail">
    <header className="run-detail-header">
      <div>
        <span className="eyebrow">{messages.executionCenter}</span>
        <h1>{run.workflowId}</h1>
        <p className="panel-subtitle">{run.id} · {new Date(run.createdAt).toLocaleString()}</p>
      </div>
      <div className="run-actions"><button className="secondary-button" type="button" onClick={onOpenInsight}>{messages.openInInsight}</button><button className="secondary-button" type="button" onClick={onCancel} disabled={['completed', 'cancelled', 'failed'].includes(run.status)}>{messages.cancel}</button></div>
    </header>
    <div className="run-summary"><div className={'status-badge status-' + run.status}><i aria-hidden="true" />{run.status}</div><span>{events.length ? messages.eventsCaptured(events.length) : messages.readyForRun}</span></div>
    <div className="event-list">{events.length ? events.map(event => <div className="event" key={event.id}><span><i className="event-dot" aria-hidden="true" /><b>{event.type}</b></span><small>{new Date(event.timestamp).toLocaleTimeString()}</small></div>) : <div className="empty-state"><span className="empty-icon">✦</span><strong>{messages.noRuns}</strong><p>{messages.runToSeeEvents}</p></div>}</div>
  </section>;
}
