import test from 'node:test';
import assert from 'node:assert/strict';
import { MockExecutionClient } from '../src/renderer/services/executionClient';

test('mock client emits a completed run', async () => {
  const client = new MockExecutionClient();
  const run = await client.createRun({ workflowId: 'workflow.md', runtime: 'workflow' });
  const events: string[] = [];
  client.subscribeRunEvents(run.id, event => events.push(event.type));
  await new Promise(resolve => setTimeout(resolve, 1400));
  assert.equal((await client.getRun(run.id)).status, 'completed');
  assert.ok(events.includes('run.completed'));
});
