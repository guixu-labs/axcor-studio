import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mapEvent,
  mapRun,
  mapRunStatus,
  type BackendEvent,
  type BackendRun,
} from '../src/shared/executionBackendApi';

const baseRecord: BackendRun = {
  run_id: 'run-1',
  kind: 'workflow',
  format: 'markdown',
  status: 'running',
  program_ref: 'workflow.md',
  params: {},
  label: 'workflow.md',
  work_dir: '/tmp/ws',
  max_parallel: null,
  pause_reason: null,
  created_at: '2026-11-03T10:00:00+00:00',
  finished_at: null,
  reopened_at: null,
  error: null,
  member_count: 0,
  running_count: 0,
};

test('mapRunStatus translates backend statuses', () => {
  assert.equal(mapRunStatus('pending'), 'queued');
  assert.equal(mapRunStatus('running'), 'running');
  assert.equal(mapRunStatus('paused'), 'paused');
  assert.equal(mapRunStatus('completed'), 'completed');
  assert.equal(mapRunStatus('failed'), 'failed');
  assert.equal(mapRunStatus('stopped'), 'cancelled');
  assert.equal(mapRunStatus('something-new'), 'queued');
});

test('mapRun maps identity, label and timestamps', () => {
  const run = mapRun(baseRecord);
  assert.equal(run.id, 'run-1');
  assert.equal(run.workflowId, 'workflow.md');
  assert.equal(run.status, 'running');
  assert.equal(run.createdAt, '2026-11-03T10:00:00+00:00');
  assert.equal(run.updatedAt, run.createdAt);
});

test('mapRun falls back to program_ref then run_id for the workflow name', () => {
  assert.equal(mapRun({ ...baseRecord, label: null }).workflowId, 'workflow.md');
  assert.equal(mapRun({ ...baseRecord, label: null, program_ref: '' }).workflowId, 'run-1');
});

test('mapRun prefers finished_at for updatedAt', () => {
  const run = mapRun({ ...baseRecord, finished_at: '2026-11-03T11:00:00+00:00' });
  assert.equal(run.updatedAt, '2026-11-03T11:00:00+00:00');
});

test('mapEvent parses JSON string payloads and maps fields', () => {
  const raw: BackendEvent = {
    id: 42,
    run_id: 'run-1',
    session_id: 'sess-1',
    iteration: null,
    timestamp: '2026-11-03T10:00:01+00:00',
    event_type: 'session_state_changed',
    data: JSON.stringify({ state: 'running' }),
    source: 'run_events',
  };
  const event = mapEvent(raw);
  assert.equal(event.id, '42');
  assert.equal(event.runId, 'run-1');
  assert.equal(event.type, 'session_state_changed');
  assert.equal(event.stepId, 'sess-1');
  assert.deepEqual(event.payload, { state: 'running' });
});

test('mapEvent keeps non-JSON payloads as-is', () => {
  const event = mapEvent({ id: 1, run_id: 'r', timestamp: 't', event_type: 'notification', data: 'plain text', source: 'events' });
  assert.equal(event.payload, 'plain text');
  assert.equal(event.stepId, undefined);
});
