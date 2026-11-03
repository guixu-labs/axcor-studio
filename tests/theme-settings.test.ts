import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateLegacyThemeId, themes } from '../src/renderer/settings';

const REQUIRED_TOKENS = ['surface-0', 'surface-1', 'surface-2', 'surface-3', 'border', 'text', 'muted', 'accent', 'accent-soft'];
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

test('theme set matches the opsbot reference: 11 themes, 5 light and 6 dark', () => {
  assert.equal(themes.length, 11);
  assert.equal(themes.filter(theme => theme.group === 'light').length, 5);
  assert.equal(themes.filter(theme => theme.group === 'dark').length, 6);
  assert.deepEqual(
    themes.map(theme => theme.id),
    ['github-light', 'vscode-light', 'one-light', 'cappuccino-latte', 'solarized-light', 'github-dark', 'vscode-dark', 'one-dark-pro', 'dracula', 'cappuccino-mocha', 'solarized-dark'],
  );
});

test('every theme declares the full token set with valid colors', () => {
  for (const theme of themes) {
    for (const key of REQUIRED_TOKENS) {
      assert.match(theme.tokens[key] ?? '', HEX_COLOR, `${theme.id} is missing a valid ${key}`);
    }
    assert.equal(theme.colorScheme, theme.group);
  }
});

test('theme ids are unique and the default theme exists', () => {
  assert.equal(new Set(themes.map(theme => theme.id)).size, themes.length);
  assert.ok(themes.some(theme => theme.id === 'github-dark'));
});

test('legacy one-dark ids migrate to one-dark-pro', () => {
  assert.equal(migrateLegacyThemeId('one-dark'), 'one-dark-pro');
  assert.equal(migrateLegacyThemeId('github-dark'), 'github-dark');
});
