import test from 'node:test';
import assert from 'node:assert/strict';
import { MockOpsbotClient } from '../src/renderer/services/opsbotClient';

test('mock client emits a completed run', async () => {
  const client = new MockOpsbotClient();
  const run = await client.createRun({ workflowId: 'workflow.md', runtime: 'opsbot' });
  const events: string[] = [];
  client.subscribeRunEvents(run.id, event => events.push(event.type));
  await new Promise(resolve => setTimeout(resolve, 1400));
  assert.equal((await client.getRun(run.id)).status, 'completed');
  assert.ok(events.includes('run.completed'));
});
