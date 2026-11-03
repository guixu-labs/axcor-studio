import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWorkflowFrontMatter, workflowProgramIssues } from '../src/renderer/workflowProgram';

test('parseWorkflowFrontMatter returns no front matter for plain content', () => {
  const parsed = parseWorkflowFrontMatter('# New workflow\n\nDescribe the workflow steps here.');
  assert.equal(parsed.exists, false);
});

test('parseWorkflowFrontMatter extracts format and fields', () => {
  const parsed = parseWorkflowFrontMatter('---\nformat: graph-yaml@1\nname: release-readiness\nversion: 0.3.0\n---\n\n# Body');
  assert.equal(parsed.exists, true);
  assert.equal(parsed.format, 'graph-yaml@1');
  assert.equal(parsed.fields['name'], 'release-readiness');
  assert.equal(parsed.fields['version'], '0.3.0');
  assert.equal(parsed.error, undefined);
});

test('parseWorkflowFrontMatter tolerates blank lines and missing values', () => {
  const parsed = parseWorkflowFrontMatter('---\nformat:\n\nnotes:\n---\nbody');
  assert.equal(parsed.format, '');
  assert.equal(parsed.fields['notes'], '');
});

test('parseWorkflowFrontMatter reports an unclosed block', () => {
  const parsed = parseWorkflowFrontMatter('---\nformat: graph-yaml@1\nbody without closing');
  assert.equal(parsed.error, 'front matter 未闭合（缺少结尾 ---）');
});

test('parseWorkflowFrontMatter reports malformed lines', () => {
  const parsed = parseWorkflowFrontMatter('---\nformat: x\nthis is not a pair\n---\n');
  assert.match(parsed.error ?? '', /无法解析/);
});

test('workflowProgramIssues requires front matter', () => {
  const issues = workflowProgramIssues('plain text');
  assert.match(issues.error ?? '', /front matter/);
});

test('workflowProgramIssues requires a format field', () => {
  const issues = workflowProgramIssues('---\nname: x\n---\n');
  assert.match(issues.error ?? '', /format/);
});

test('workflowProgramIssues accepts a program with format', () => {
  const issues = workflowProgramIssues('---\nformat: graph-yaml@1\n---\nbody');
  assert.equal(issues.error, undefined);
  assert.equal(issues.format, 'graph-yaml@1');
});
