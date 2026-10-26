import test from 'node:test';
import assert from 'node:assert/strict';
import { isTerminalRun } from '../src/shared/run';

test('terminal run statuses are recognized', () => {
  assert.equal(isTerminalRun({ id: '1', workflowId: 'w', status: 'completed', createdAt: '', updatedAt: '' }), true);
  assert.equal(isTerminalRun({ id: '1', workflowId: 'w', status: 'running', createdAt: '', updatedAt: '' }), false);
});
