import { useMemo } from 'react';
import type { RunEvent, RunStatus } from '../../shared/protocol';
import { eventPayloadRecord as record, isSubagentTool, toolArgumentRecord } from '../../shared/run';
import type { Messages } from '../i18n';

type Labels = Messages['runDetail'];

interface AgentNode {
  key: string;
  id: string;
  name?: string;
  type?: string;
  parent?: string;
  status?: RunStatus;
}

const lifecycleTypes = new Set(['subagent_start', 'subagent_progress', 'subagent_stop', 'subagent_context']);
const taskTypes = new Set(['task_started', 'task_progress', 'task_notification']);

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function scopedKey(event: RunEvent, id: string): string {
  return JSON.stringify([event.stepId ?? '', id]);
}

function stoppedStatus(value: unknown): RunStatus | undefined {
  if (value === 'failed' || value === 'error') return 'failed';
  if (value === 'stopped' || value === 'cancelled' || value === 'canceled' || value === 'interrupted')
    return 'cancelled';
  return value === 'completed' ? 'completed' : undefined;
}

function buildTopology(events: RunEvent[]) {
  const nodes = new Map<string, AgentNode>();
  const aliases = new Map<string, string>();
  const getNode = (key: string, id: string): AgentNode => {
    const node = nodes.get(key) ?? { key, id };
    nodes.set(key, node);
    return node;
  };

  for (const event of events) {
    if (event.type !== 'tool_call' && event.type !== 'tool_use') continue;
    const data = record(event.payload);
    if (!data || !isSubagentTool(data.name ?? data.tool_name)) continue;
    const id = text(data.tool_use_id ?? data.id);
    if (!id) continue;
    const node = getNode(scopedKey(event, id), id);
    const input = toolArgumentRecord(data.input, data.arg ?? data.arguments);
    node.name ??= text(input?.description);
    node.type ??= text(input?.subagent_type ?? input?.agent_type);
    const parent = text(data.parent_agent_id ?? data.parent_tool_use_id);
    if (parent) node.parent = scopedKey(event, parent);
    if (data.is_error === true) node.status = 'failed';
  }

  // Claude CLI task notifications link the task ID back to its dispatch tool.
  for (const event of events) {
    const data = record(event.payload);
    if (!data) continue;
    const isTask = event.type === 'notification' && taskTypes.has(text(data.subtype) ?? '');
    if (!isTask && !lifecycleTypes.has(event.type)) continue;
    const id = text(isTask ? data.task_id : data.agent_id);
    const callId = text(data.tool_use_id);
    if (!id || !callId) continue;
    const callKey = scopedKey(event, callId);
    if (nodes.has(callKey)) aliases.set(scopedKey(event, id), callKey);
  }

  for (const event of events) {
    const data = record(event.payload);
    if (!data) continue;
    const subtype = text(data.subtype) ?? '';
    const isTask = event.type === 'notification' && taskTypes.has(subtype);
    if (!isTask && !lifecycleTypes.has(event.type)) continue;
    const id = text(isTask ? data.task_id : data.agent_id);
    if (!id) continue;
    const eventKey = scopedKey(event, id);
    const key = aliases.get(eventKey) ?? eventKey;
    if (isTask && (data.task_type === 'local_bash' || (data.task_type !== 'local_agent' && !nodes.has(key)))) continue;

    const node = getNode(key, id);
    node.id = id;
    node.name ??= text(data.description);
    node.type ??= text(data.agent_type);
    const parent = text(data.parent_agent_id ?? data.parent_tool_use_id);
    if (parent) node.parent = scopedKey(event, parent);
    if (event.type === 'subagent_stop') {
      node.status = stoppedStatus(data.status) ?? 'completed';
    } else if (subtype === 'task_notification') {
      node.status = stoppedStatus(data.status) ?? node.status;
    } else {
      node.status ??= 'running';
    }
  }

  const children = new Map<string | undefined, AgentNode[]>();
  for (const node of nodes.values()) {
    if (node.parent) node.parent = aliases.get(node.parent) ?? node.parent;
  }
  for (const node of nodes.values()) {
    let parent = node.parent && nodes.has(node.parent) ? node.parent : undefined;
    const seen = new Set([node.key]);
    for (let ancestor = parent; ancestor; ancestor = nodes.get(ancestor)?.parent) {
      if (seen.has(ancestor)) { parent = undefined; break; }
      seen.add(ancestor);
    }
    const branch = children.get(parent) ?? [];
    branch.push(node);
    children.set(parent, branch);
  }
  return { children, count: nodes.size };
}

function Branch({
  children,
  parent,
  labels,
}: {
  children: Map<string | undefined, AgentNode[]>;
  parent?: string;
  labels: Labels;
}): JSX.Element | null {
  const nodes = children.get(parent);
  if (!nodes?.length) return null;
  return <ul className="run-agent-branches">{nodes.map(node => <li key={node.key}>
    <div className="run-agent-node">
      <div className="run-agent-name">
        <strong title={node.name || node.type || node.id}>{node.name || node.type || labels.subagentCall}</strong>
        <small title={node.id}>{node.name && node.type ? node.type : node.id}</small>
      </div>
      <span className={'status-badge' + (node.status ? ' status-' + node.status : '')}>
        <i aria-hidden="true" />{node.status ? labels.status[node.status] : labels.subagentDispatched}
      </span>
    </div>
    <Branch children={children} parent={node.key} labels={labels} />
  </li>)}</ul>;
}

export function RunSubagentTopology({ events, labels }: { events: RunEvent[]; labels: Labels }): JSX.Element | null {
  const { children, count } = useMemo(() => buildTopology(events), [events]);
  if (!count) return null;
  return <section className="run-subagents" aria-labelledby="run-agent-topology-title">
    <h3 id="run-agent-topology-title">{labels.subagents} <span>{count}</span></h3>
    <div className="run-agent-tree">
      <div className="run-agent-node run-agent-root"><strong>{labels.mainAgent}</strong></div>
      <Branch children={children} labels={labels} />
    </div>
  </section>;
}
