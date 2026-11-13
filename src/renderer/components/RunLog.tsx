import { memo, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import type { RunEvent } from '../../shared/protocol';
import { eventPayloadRecord as record, isSubagentTool, runEventKey, toolArgumentRecord } from '../../shared/run';
import type { Messages } from '../i18n';

type Labels = Messages['runDetail'];
type Payload = Record<string, unknown>;

interface Block { text: string; label?: 'thinking' | 'toolInput' | 'toolResult'; code?: boolean; }
interface ToolCall {
  event: RunEvent;
  name?: string;
  input?: unknown;
  argument?: unknown;
  result?: Block;
  standaloneResult?: boolean;
  failed?: boolean;
}
interface LogEntry {
  event: RunEvent;
  key: string;
  kind: string;
  preview: string;
  blocks: Block[];
  subagent?: boolean;
  code?: boolean;
  status?: 'failed' | 'returned';
}

const visibleEvents = new Set(['process_output', 'process_exit', 'error', 'rate_limit_event', 'run_failed']);
const notificationSubtypes = new Set([
  'task_started',
  'task_progress',
  'task_notification',
  'task_summary',
  'post_turn_summary',
  'notification',
  'api_retry',
  'warning',
  'error',
]);

function nonempty(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function payloadText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value == null) return '';
  if (Array.isArray(value)) {
    const text = value.map(item => nonempty(record(item)?.text)).filter(Boolean).join('\n');
    if (text) return text;
  }
  return JSON.stringify(value, null, 2) ?? '';
}

function toolKey(event: RunEvent, id: unknown): string | undefined {
  return typeof id === 'string' && id ? JSON.stringify([event.stepId ?? '', id]) : undefined;
}

function callKey(event: RunEvent): string {
  const data = record(event.payload);
  return toolKey(event, data?.tool_use_id ?? data?.id) ?? runEventKey(event);
}

function isToolCall(event: RunEvent): boolean {
  return event.type === 'tool_call' || event.type === 'tool_use';
}

function notificationText(data: Payload | undefined): string | undefined {
  if (!data || typeof data.subtype !== 'string') return undefined;
  if (data.subtype === 'hook_response') {
    if (typeof data.exit_code !== 'number' || data.exit_code === 0) return undefined;
    return (
      [data.hook_name, data.stderr || data.output].map(nonempty).filter(Boolean).join('\n') ||
      `hook_response (${data.exit_code})`
    );
  }
  if (!notificationSubtypes.has(data.subtype)) return undefined;
  const message = [
    data.text,
    data.description,
    data.summary,
    data.detail,
    data.status_detail,
    data.needs_action,
    data.message,
    data.error,
  ]
    .map(nonempty)
    .filter(Boolean)
    .join('\n');
  if (message) return message;
  if (data.subtype === 'api_retry' && typeof data.attempt === 'number') {
    return ['api_retry #' + data.attempt, data.error_status].filter(Boolean).join(' · ');
  }
  return undefined;
}

function buildLog(events: RunEvent[], labels: Labels): LogEntry[] {
  const tools = new Map<string, ToolCall>();
  for (const event of events) {
    if (!isToolCall(event)) continue;
    const key = callKey(event);
    const tool = tools.get(key) ?? { event };
    const data = record(event.payload);
    tool.name ??= nonempty(data?.name ?? data?.tool_name);
    tool.input ??= data?.input;
    tool.argument ??= data?.arg ?? data?.arguments;
    tool.failed ||= data?.is_error === true;
    tools.set(key, tool);
  }

  const attachResult = (event: RunEvent, data: Payload, standalone: boolean): boolean => {
    const key = toolKey(event, data.tool_use_id ?? data.id);
    const tool = key && tools.get(key);
    if (!tool) return false;
    const output = data.content ?? data.output ?? data.result ?? data;
    const fields = toolArgumentRecord(output, undefined);
    const text = payloadText(fields ?? output);
    if (text && (!tool.result || (standalone && !tool.standaloneResult))) {
      tool.result = { text, label: 'toolResult', code: Boolean(fields) };
      tool.standaloneResult = standalone;
    }
    tool.failed ||= data.is_error === true;
    return true;
  };

  const contentBlocks = (event: RunEvent, content: unknown): Block[] => {
    if (!Array.isArray(content)) return typeof content === 'string' && content.trim() ? [{ text: content }] : [];
    return content.flatMap(value => {
      const block = record(value);
      if (block?.type === 'text' && nonempty(block.text)) return [{ text: String(block.text) }];
      if (block?.type === 'thinking' && nonempty(block.thinking))
        return [{ text: String(block.thinking), label: 'thinking' as const }];
      if (block?.type === 'tool_result' && !attachResult(event, block, false)) {
        return [{ text: payloadText(block.content ?? block), label: 'toolResult' as const }];
      }
      if (block?.type === 'tool_use' && !tools.has(toolKey(event, block.id) ?? '')) {
        return [
          {
            text: [block.name, payloadText(block.input)].filter(Boolean).join('\n'),
            label: 'toolInput' as const,
            code: true,
          },
        ];
      }
      return [];
    });
  };

  const rows: Array<LogEntry | ToolCall> = [];
  for (const event of events) {
    const data = record(event.payload);
    if (isToolCall(event)) {
      const tool = tools.get(callKey(event));
      if (tool?.event === event) rows.push(tool);
      continue;
    }
    let kind = event.type;
    let preview: string | undefined;
    let blocks: Block[] = [];
    const subagent = event.type !== 'subagent_context' && Object.hasOwn(labels.subagentEvents, event.type);
    if (
      event.type === 'assistant_message' ||
      event.type === 'user_message' ||
      event.type === 'log_query' ||
      event.type === 'log_manual'
    ) {
      kind = event.type === 'assistant_message' ? labels.assistant : labels.user;
      blocks = contentBlocks(event, data?.content ?? data?.prompt ?? data?.text ?? event.payload);
    } else if (event.type === 'tool_result') {
      if (data && attachResult(event, data, true)) continue;
      kind = labels.toolResult;
      blocks = [
        { text: payloadText(data?.content ?? data?.output ?? data?.result ?? event.payload), label: 'toolResult' },
      ];
    } else if (event.type === 'notification') {
      const text = notificationText(data);
      if (!text) continue;
      kind = labels.notification;
      preview = text;
      blocks = [{ text: [text, data?.status].map(nonempty).filter(Boolean).join('\n') }];
    } else if (subagent) {
      kind = labels.subagentEvents[event.type];
      preview = [data?.agent_type, data?.agent_id].map(nonempty).filter(Boolean).join(' · ');
      blocks = [...contentBlocks(event, data?.messages), ...contentBlocks(event, data?.content)];
      if (!blocks.length) blocks = [{ text: payloadText(event.payload) }];
    } else if (visibleEvents.has(event.type)) {
      blocks = [{ text: payloadText(data?.line ?? data?.message ?? data?.error ?? event.payload) }];
      if (event.type === 'process_exit' && typeof data?.returncode === 'number') preview = `exit ${data.returncode}`;
    }
    blocks = blocks.filter(block => block.text.trim());
    if (!blocks.length) continue;
    const sample = blocks.find(block => !block.label) ?? blocks[0];
    preview ||= sample.label ? labels[sample.label] : sample.text;
    const code = event.type === 'process_output' || event.type === 'process_exit';
    rows.push({ event, key: runEventKey(event), kind, preview, blocks, subagent, code });
  }

  return rows.map(row => {
    if ('blocks' in row) return row;
    const subagent = isSubagentTool(row.name);
    const kind = subagent ? labels.subagentCall : labels.toolCall;
    const blocks: Block[] = [];
    const fields = toolArgumentRecord(row.input, row.argument);
    const input = payloadText(fields ?? row.input ?? row.argument);
    const preview = row.name || kind;
    if (input.trim()) blocks.push({ text: input, label: 'toolInput', code: true });
    if (row.result) blocks.push(row.result);
    const status = row.failed ? 'failed' : row.result ? 'returned' : undefined;
    return { event: row.event, key: callKey(row.event), kind, preview, blocks, subagent, code: !subagent, status };
  });
}

const LogRow = memo(function LogRow({ row, labels }: { row: LogEntry; labels: Labels }): JSX.Element {
  const { event } = row;
  const timestamp = new Date(event.timestamp);
  const time = Number.isNaN(timestamp.getTime()) ? event.timestamp : timestamp.toLocaleTimeString(undefined, {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  const preview = row.preview.trim().split(/\r?\n/, 1)[0].slice(0, 240);
  const singleBlock = row.blocks.length === 1 ? row.blocks[0] : undefined;
  const expandable =
    row.blocks.length > 0 && (!singleBlock || singleBlock.label !== undefined || singleBlock.text.trim() !== preview);
  const displayText = expandable ? preview : row.preview.trim();
  const summary = (
    <span className={'event-preview' + (row.code ? ' event-mono' : '')} title={displayText}>
      {displayText}
    </span>
  );
  return (
    <div
      className={
        'event' + (event.source === 'run_events' ? ' event-workflow' : '') + (row.subagent ? ' event-subagent' : '')
      }
    >
      <time dateTime={event.timestamp} title={event.timestamp}>
        {time}
      </time>
      <span className="event-kind" title={row.kind}>
        {row.kind}
      </span>
      {expandable ? (
        <details className="event-disclosure">
          <summary className="event-summary">{summary}</summary>
          <div className="event-content">
            {row.blocks.map((block, index) => (
              <div key={index} className={'event-block' + (block.label === 'thinking' ? ' event-thinking' : '')}>
                {block.label && <strong>{labels[block.label]}</strong>}
                <div className={block.code || (!block.label && row.code) ? 'event-mono' : undefined}>
                  {block.text}
                </div>
              </div>
            ))}
          </div>
        </details>
      ) : (
        <div className="event-summary event-summary-static">{summary}</div>
      )}
      {row.status && (
        <span className={'event-state event-state-' + row.status}>
          {row.status === 'failed' ? labels.status.failed : labels.toolReturned}
        </span>
      )}
    </div>
  );
});

export function RunLog({
  events,
  messages,
  children,
}: {
  events: RunEvent[];
  messages: Messages;
  children?: ReactNode;
}): JSX.Element {
  const log = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const labels = messages.runDetail;
  const rows = useMemo(() => buildLog(events, labels), [events, labels]);
  useLayoutEffect(() => {
    if (log.current && following.current) log.current.scrollTop = log.current.scrollHeight;
  }, [rows.length]);

  return (
    <section className="run-log-panel">
      <header className="run-pane-heading">
        <h2>{labels.log}</h2>
        <span>{messages.eventsCaptured(rows.length)}</span>
      </header>
      <div
        className="event-list"
        ref={log}
        role="log"
        aria-label={labels.log}
        aria-live="off"
        tabIndex={0}
        onScroll={event => {
          const target = event.currentTarget;
          following.current = target.scrollHeight - target.clientHeight - target.scrollTop <= 24;
        }}
      >
        {rows.length ? (
          rows.map(row => <LogRow key={row.key} row={row} labels={labels} />)
        ) : (
          <p className="run-log-empty">{labels.waiting}</p>
        )}
      </div>
      {children}
    </section>
  );
}
