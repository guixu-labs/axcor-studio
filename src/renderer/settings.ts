export interface ThemeDefinition {
  id: string;
  label: string;
  group: 'light' | 'dark';
  colorScheme: 'light' | 'dark';
  tokens: Record<string, string>;
}

export interface FontDefinition { id: string; label: string; family: string; }

// Palettes aligned with the opsbot reference frontend (feat/reasoning-0day-adaptation,
// src/opsbot/web/frontend/src/composables/useAppearance.ts): same theme ids, labels
// and color values so the workbench shell matches the Opsbot and Insight views.
// Slot mapping: surface-0 ← body, surface-1 ← surface, surface-2 ← card,
// surface-3 ← input, border ← border, text ← text, muted ← textMuted,
// accent ← primary. accent-soft (selected/highlight tint) is derived per theme.
export const themes: ThemeDefinition[] = [
  { id: 'github-light', label: 'GitHub Light', group: 'light', colorScheme: 'light', tokens: { 'surface-0': '#f6f8fa', 'surface-1': '#ffffff', 'surface-2': '#ffffff', 'surface-3': '#ffffff', border: '#d0d7de', text: '#1f2328', muted: '#656d76', accent: '#0969da', 'accent-soft': '#ddf4ff' } },
  { id: 'vscode-light', label: 'VS Code Light', group: 'light', colorScheme: 'light', tokens: { 'surface-0': '#f3f3f3', 'surface-1': '#ffffff', 'surface-2': '#ffffff', 'surface-3': '#ffffff', border: '#d6d6d6', text: '#333333', muted: '#616161', accent: '#0066b8', 'accent-soft': '#dcecf7' } },
  { id: 'one-light', label: 'One Light', group: 'light', colorScheme: 'light', tokens: { 'surface-0': '#fafafa', 'surface-1': '#ffffff', 'surface-2': '#ffffff', 'surface-3': '#ffffff', border: '#d9d9d9', text: '#383a42', muted: '#696c77', accent: '#4078f2', 'accent-soft': '#e5edff' } },
  { id: 'cappuccino-latte', label: 'Cappuccino Latte', group: 'light', colorScheme: 'light', tokens: { 'surface-0': '#eff1f5', 'surface-1': '#ffffff', 'surface-2': '#ffffff', 'surface-3': '#ffffff', border: '#ccd0da', text: '#4c4f69', muted: '#6c6f85', accent: '#1e66f5', 'accent-soft': '#dde8fe' } },
  { id: 'solarized-light', label: 'Solarized Light', group: 'light', colorScheme: 'light', tokens: { 'surface-0': '#fdf6e3', 'surface-1': '#eee8d5', 'surface-2': '#fdf6e3', 'surface-3': '#fdf6e3', border: '#d6cdb5', text: '#586e75', muted: '#839496', accent: '#268bd2', 'accent-soft': '#d9edf9' } },
  { id: 'github-dark', label: 'GitHub Dark', group: 'dark', colorScheme: 'dark', tokens: { 'surface-0': '#0d1117', 'surface-1': '#161b22', 'surface-2': '#161b22', 'surface-3': '#21262d', border: '#30363d', text: '#f0f6fc', muted: '#8b949e', accent: '#58a6ff', 'accent-soft': '#1f3a5a' } },
  { id: 'vscode-dark', label: 'VS Code Dark', group: 'dark', colorScheme: 'dark', tokens: { 'surface-0': '#1e1e1e', 'surface-1': '#252526', 'surface-2': '#252526', 'surface-3': '#3c3c3c', border: '#454545', text: '#cccccc', muted: '#9d9d9d', accent: '#3794ff', 'accent-soft': '#263b50' } },
  { id: 'one-dark-pro', label: 'One Dark Pro', group: 'dark', colorScheme: 'dark', tokens: { 'surface-0': '#282c34', 'surface-1': '#21252b', 'surface-2': '#21252b', 'surface-3': '#2c313c', border: '#3e4451', text: '#abb2bf', muted: '#7f848e', accent: '#61afef', 'accent-soft': '#3e6383' } },
  { id: 'dracula', label: 'Dracula', group: 'dark', colorScheme: 'dark', tokens: { 'surface-0': '#282a36', 'surface-1': '#21222c', 'surface-2': '#21222c', 'surface-3': '#343746', border: '#44475a', text: '#f8f8f2', muted: '#a9abbd', accent: '#bd93f9', 'accent-soft': '#675588' } },
  { id: 'cappuccino-mocha', label: 'Cappuccino Mocha', group: 'dark', colorScheme: 'dark', tokens: { 'surface-0': '#1e1e2e', 'surface-1': '#181825', 'surface-2': '#181825', 'surface-3': '#313244', border: '#45475a', text: '#cdd6f4', muted: '#a6adc8', accent: '#89b4fa', 'accent-soft': '#3e4b6b' } },
  { id: 'solarized-dark', label: 'Solarized Dark', group: 'dark', colorScheme: 'dark', tokens: { 'surface-0': '#002b36', 'surface-1': '#073642', 'surface-2': '#073642', 'surface-3': '#073642', border: '#1b4b55', text: '#839496', muted: '#657b83', accent: '#2aa198', 'accent-soft': '#0f5458' } },
];

// One Dark was replaced by One Dark Pro when aligning with the opsbot
// palette; stored ids pointing at the removed theme fall back to its
// successor instead of the default theme.
export function migrateLegacyThemeId(id: string): string {
  return id === 'one-dark' ? 'one-dark-pro' : id;
}

export const fonts: FontDefinition[] = [
  { id: 'system', label: 'System', family: 'Inter, ui-sans-serif, system-ui, sans-serif' },
  { id: 'arial', label: 'Arial', family: 'Arial, sans-serif' },
  { id: 'source-han-sans', label: '思源黑体', family: '"Source Han Sans SC", "Noto Sans CJK SC", sans-serif' },
  { id: 'pingfang', label: '苹方', family: 'PingFang SC, sans-serif' },
  { id: 'microsoft-yahei', label: '微软雅黑', family: 'Microsoft YaHei, sans-serif' },
  { id: 'jetbrains-mono', label: 'JetBrains Mono', family: '"JetBrains Mono", "SFMono-Regular", Consolas, monospace' },
];

export const defaultTheme = themes.find(theme => theme.id === 'github-dark') ?? themes[0];
export const defaultFont = fonts.find(font => font.id === 'system') ?? fonts[0];
