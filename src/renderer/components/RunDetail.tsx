import { useEffect, useMemo, useRef, useState } from 'react';
import { RUNTIMES, type Run, type RunEvent } from '../../shared/protocol';
import { eventPayloadRecord as asRecord, isTerminalRun } from '../../shared/run';
import type { Messages } from '../i18n';
import { RunLog } from './RunLog';
import { RunSubagentTopology } from './RunSubagentTopology';

interface RunDetailProps {
  run: Run;
  events: RunEvent[];
  onStop: () => Promise<void>;
  onOpenInsight: () => void;
  onSetPaused: (paused: boolean) => Promise<void>;
  onSendReply: (text: string) => Promise<void>;
  messages: Messages;
}

function tokenCount(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function latestContext(events: RunEvent[], windowSize?: number) {
  let latest: { used: number; segments: Array<{ key: 'input' | 'output' | 'cacheRead' | 'cacheWrite'; count: number | undefined }> } | undefined;
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (event.type !== 'context_usage' && event.type !== 'step_finish' && event.type !== 'main_context') continue;
    const data = asRecord(event.payload);
    windowSize ||= tokenCount(data?.max_tokens) || Math.max(0, ...Object.values(asRecord(data?.modelUsage) ?? {})
      .map(value => tokenCount(asRecord(value)?.contextWindow) ?? 0));
    if (latest) {
      if (windowSize) break;
      continue;
    }
    if (event.type === 'main_context') {
      const used = tokenCount(data?.current_tokens);
      if (used !== undefined) latest = { used, segments: [] };
      if (latest && windowSize) break;
      continue;
    }
    const usage = asRecord(data?.context_usage);
    if (!usage) continue;
    const segments = [
      { key: 'input' as const, count: tokenCount(usage.input_tokens) },
      { key: 'output' as const, count: tokenCount(usage.output_tokens) },
      { key: 'cacheRead' as const, count: tokenCount(usage.cache_read_input_tokens) },
      { key: 'cacheWrite' as const, count: tokenCount(usage.cache_creation_input_tokens ?? usage.cache_write_input_tokens) },
    ];
    if (!segments.some(segment => segment.count !== undefined)) continue;
    latest = { used: segments.reduce((sum, segment) => sum + (segment.count ?? 0), 0), segments };
    if (windowSize) break;
  }
  return latest && { ...latest, window: windowSize };
}

function RunElapsed({ run, label }: { run: Run; label: string }): JSX.Element | null {
  const [live, setLive] = useState<number>();
  const latestSample = useRef(run.elapsedSeconds);
  const hasSample = run.elapsedSeconds !== undefined;
  useEffect(() => { latestSample.current = run.elapsedSeconds; }, [run.elapsedSeconds]);
  useEffect(() => {
    if (run.status !== 'running') return;
    const started = Date.parse(run.createdAt);
    const elapsed = latestSample.current ?? (Number.isFinite(started) ? (Date.now() - started) / 1000 : 0);
    const origin = performance.now() - Math.max(0, elapsed) * 1000;
    let timeout: ReturnType<typeof setTimeout>;
    const tick = (): void => {
      const milliseconds = performance.now() - origin;
      setLive(Math.floor(milliseconds / 1000));
      timeout = setTimeout(tick, 1000 - milliseconds % 1000);
    };
    tick();
    return () => clearTimeout(timeout);
  }, [run.status, run.createdAt, hasSample]);

  const duration = (Date.parse(run.updatedAt) - Date.parse(run.createdAt)) / 1000;
  const elapsed = run.status === 'running' ? live ?? run.elapsedSeconds : run.elapsedSeconds
    ?? (Number.isFinite(duration) && duration > 0 ? duration : live);
  if (elapsed === undefined) return null;
  const seconds = Math.max(0, Math.floor(elapsed));
  const time = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map(part => String(part).padStart(2, '0')).join(':');
  return <time className="run-elapsed" dateTime={'PT' + seconds + 'S'} title={label} aria-label={label + ' ' + time}>{time}</time>;
}

export function RunDetail({ run, events, onStop, onOpenInsight, onSetPaused, onSendReply, messages }: RunDetailProps): JSX.Element {
  const labels = messages.runDetail;
  const stopDialog = useRef<HTMLDialogElement>(null);
  const [reply, setReply] = useState('');
  const [sessionActionPending, setSessionActionPending] = useState(false);
  const [sessionActionError, setSessionActionError] = useState<string>();
  const isSession = run.runtimeId === 'session';
  const isPaused = run.status === 'paused';
  const canReply = isSession && run.status !== 'failed' && run.status !== 'cancelled';
  const canSetPaused = isSession && (run.status === 'running' || isPaused);
  const stopButton = <button className="secondary-button stop-run-button" type="button" disabled={isTerminalRun(run) || sessionActionPending}
    onClick={() => stopDialog.current?.showModal()}>{labels.stop}</button>;
  const performSessionAction = async (action: () => Promise<void>): Promise<void> => {
    if (sessionActionPending) return;
    setSessionActionPending(true);
    setSessionActionError(undefined);
    try {
      await action();
    } catch (error) {
      setSessionActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setSessionActionPending(false);
    }
  };
  const context = useMemo(() => run.runtimeId === 'session' ? latestContext(events, run.contextWindow) : undefined,
    [events, run.contextWindow, run.runtimeId]);
  const createdAt = run.createdAt ? new Date(run.createdAt) : null;
  const runtimeLabel = RUNTIMES.find(runtime => runtime.id === run.runtimeId)?.label ?? run.runtimeId;
  const windowSize = context?.window;
  const tokens = context?.used ?? 0;
  const percent = (count: number): string => windowSize ? (count / windowSize).toLocaleString(undefined, { style: 'percent', maximumFractionDigits: 1 }) : '';
  const barTotal = Math.max(tokens, windowSize ?? 0);
  const free = windowSize ? Math.max(windowSize - tokens, 0) : undefined;
  return <section className="run-detail run-console">
    <header className="run-detail-header">
      <div className="run-detail-title">
        <h1 title={run.workflowId}>{run.workflowId}</h1>
        <span className={'status-badge status-' + run.status}><i aria-hidden="true" />{labels.status[run.status]}</span>
        <RunElapsed run={run} label={labels.elapsed} />
      </div>
      <div className="run-actions">
        <button className="secondary-button" type="button" onClick={onOpenInsight}>{messages.openInInsight}</button>
        {!isSession && stopButton}
      </div>
    </header>
    <div className="run-detail-body">
      <RunLog events={events} messages={messages}>
        {canReply && <div className="session-reply" aria-busy={sessionActionPending}>
          <textarea className="run-config-input session-reply-input" rows={1} aria-label={labels.sessionReply}
            placeholder={labels.sessionReply} value={reply} disabled={sessionActionPending}
            onChange={event => setReply(event.target.value)} />
          <div className="session-reply-actions">
            <button className="primary-button" type="button" disabled={sessionActionPending || !reply.trim()} onClick={() => {
              void performSessionAction(async () => {
                await onSendReply(reply.trim());
                setReply('');
              });
            }}>{labels.sendReply}</button>
            {canSetPaused && <button className="secondary-button" type="button" disabled={sessionActionPending} onClick={() => {
              void performSessionAction(() => onSetPaused(!isPaused));
            }}>{isPaused ? labels.resumeSession : labels.pauseSession}</button>}
            {stopButton}
          </div>
        </div>}
        {sessionActionError && <p className="session-action-error" role="alert">{sessionActionError}</p>}
      </RunLog>
      <section className="run-overview">
        <header className="run-pane-heading"><h2>{labels.overview}</h2></header>
        <div className="run-overview-content">
          <dl className="run-overview-stats">
            <div><dt>{labels.id}</dt><dd title={run.id}>{run.id}</dd></div>
            <div><dt>{messages.runtime}</dt><dd>{runtimeLabel}</dd></div>
            {run.model && <div><dt>{messages.sessionModel}</dt><dd>{run.model}</dd></div>}
            {run.iteration !== undefined && <div><dt>{labels.iteration}</dt><dd>{run.iteration}{run.maxIterations ? ` / ${run.maxIterations}` : ''}</dd></div>}
            {run.memberCount !== undefined && <div><dt>{labels.members}</dt><dd>{run.memberCount}</dd></div>}
            {run.runningCount !== undefined && <div><dt>{labels.running}</dt><dd>{run.runningCount}</dd></div>}
            {createdAt && !Number.isNaN(createdAt.getTime()) && <div><dt>{labels.createdAt}</dt><dd>{createdAt.toLocaleString()}</dd></div>}
          </dl>
          {context && <section className="run-context">
            <h3>{labels.context}</h3>
            <div className="run-context-summary">
              {!!windowSize && <strong className="run-context-percent">{percent(tokens)}</strong>}
              <p>{tokens.toLocaleString()}{windowSize ? ` / ${windowSize.toLocaleString()}` : ''} tokens</p>
            </div>
            {!!windowSize && <div className="run-context-bar" aria-hidden="true">
              {context.segments.length ? context.segments.map(segment => segment.count ? <span key={segment.key} className={'run-context-' + segment.key} style={{ width: `${segment.count / barTotal * 100}%` }} /> : null)
                : <span className="run-context-input" style={{ width: `${tokens / barTotal * 100}%` }} />}
            </div>}
            {context.segments.length > 0 && <dl className="run-overview-stats run-context-legend">
              {context.segments.map(segment => segment.count !== undefined && <div key={segment.key}>
                <dt><i className={'run-context-' + segment.key} aria-hidden="true" />{labels[segment.key]}</dt>
                <dd>{segment.count.toLocaleString()}{windowSize ? <small>{percent(segment.count)}</small> : null}</dd>
              </div>)}
              {free !== undefined && <div><dt><i className="run-context-free" aria-hidden="true" />{labels.free}</dt><dd>{free.toLocaleString()}<small>{percent(free)}</small></dd></div>}
            </dl>}
          </section>}
          <RunSubagentTopology events={events} labels={labels} />
        </div>
      </section>
    </div>
    <dialog className="workbench-dialog" ref={stopDialog} aria-labelledby="stop-run-title" aria-describedby="stop-run-message">
      <h2 id="stop-run-title">{isSession ? labels.stopSessionTitle : labels.stopRunTitle}</h2>
      <p id="stop-run-message">{isSession ? labels.stopSessionMessage : labels.stopRunMessage}</p>
      <div className="workbench-dialog-actions">
        <button className="secondary-button" type="button" onClick={() => stopDialog.current?.close()}>{messages.cancel}</button>
        <button className="primary-button" type="button" disabled={isTerminalRun(run)} onClick={() => {
          stopDialog.current?.close();
          void performSessionAction(onStop);
        }}>{labels.stop}</button>
      </div>
    </dialog>
  </section>;
}
