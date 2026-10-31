import test from 'node:test';
import assert from 'node:assert/strict';
import { createEditorGroupLayout, splitEditorGroup } from '../src/renderer/workbench/layout';

test('editor group layout starts with one group', () => {
  const layout = createEditorGroupLayout();
  assert.equal(layout.groups.length, 1);
  assert.equal(layout.groups[0]?.id, 'editor-group-1');
});

test('editor group layout can split and collapse', () => {
  const initial = createEditorGroupLayout();
  const split = splitEditorGroup(initial, 'horizontal');
  assert.equal(split.orientation, 'horizontal');
  assert.equal(split.groups.length, 2);
  assert.equal(split.groups[1]?.id, 'editor-group-2');
  assert.equal(splitEditorGroup(split, 'horizontal').groups.length, 1);
});
