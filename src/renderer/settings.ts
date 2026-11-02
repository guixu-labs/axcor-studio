export interface ThemeDefinition {
  id: string;
  label: string;
  group: 'light' | 'dark';
  colorScheme: 'light' | 'dark';
  tokens: Record<string, string>;
}

export interface FontDefinition { id: string; label: string; family: string; }

export const themes: ThemeDefinition[] = [
  { id: 'github-dark', label: 'GitHub Dark', group: 'dark', colorScheme: 'dark', tokens: { 'surface-0': '#0d1117', 'surface-1': '#161b22', 'surface-2': '#1c2128', 'surface-3': '#21262d', border: '#30363d', text: '#e6edf3', muted: '#8b949e', accent: '#58a6ff', 'accent-soft': '#1f3a5a' } },
  { id: 'vscode-dark', label: 'VS Code Dark', group: 'dark', colorScheme: 'dark', tokens: { 'surface-0': '#1e1e1e', 'surface-1': '#252526', 'surface-2': '#2d2d30', 'surface-3': '#333337', border: '#3e3e42', text: '#d4d4d4', muted: '#9d9d9d', accent: '#569cd6', 'accent-soft': '#263b50' } },
  { id: 'one-dark', label: 'One Dark', group: 'dark', colorScheme: 'dark', tokens: { 'surface-0': '#282c34', 'surface-1': '#21252b', 'surface-2': '#2c313a', 'surface-3': '#343a46', border: '#3e4451', text: '#abb2bf', muted: '#7f848e', accent: '#61afef', 'accent-soft': '#263b52' } },
  { id: 'cappuccino-mocha', label: 'Cappuccino Mocha', group: 'dark', colorScheme: 'dark', tokens: { 'surface-0': '#1e1e2e', 'surface-1': '#181825', 'surface-2': '#24243a', 'surface-3': '#313149', border: '#454563', text: '#cdd6f4', muted: '#9399b2', accent: '#cba6f7', 'accent-soft': '#3b2e51' } },
  { id: 'solarized-dark', label: 'Solarized Dark', group: 'dark', colorScheme: 'dark', tokens: { 'surface-0': '#002b36', 'surface-1': '#073642', 'surface-2': '#0b3d48', 'surface-3': '#164c55', border: '#235a62', text: '#eee8d5', muted: '#93a1a1', accent: '#b58900', 'accent-soft': '#463a08' } },
  { id: 'github-light', label: 'GitHub Light', group: 'light', colorScheme: 'light', tokens: { 'surface-0': '#f6f8fa', 'surface-1': '#ffffff', 'surface-2': '#f6f8fa', 'surface-3': '#eef1f4', border: '#d0d7de', text: '#1f2328', muted: '#656d76', accent: '#0969da', 'accent-soft': '#ddf4ff' } },
  { id: 'vscode-light', label: 'VS Code Light', group: 'light', colorScheme: 'light', tokens: { 'surface-0': '#f3f3f3', 'surface-1': '#ffffff', 'surface-2': '#f8f8f8', 'surface-3': '#e8e8e8', border: '#d6d6d6', text: '#3b3b3b', muted: '#6e6e6e', accent: '#006ab1', 'accent-soft': '#dcecf7' } },
  { id: 'one-light', label: 'One Light', group: 'light', colorScheme: 'light', tokens: { 'surface-0': '#fafafa', 'surface-1': '#ffffff', 'surface-2': '#f3f3f3', 'surface-3': '#e5e5e6', border: '#d6d6d6', text: '#383a42', muted: '#696c77', accent: '#4078f2', 'accent-soft': '#e5edff' } },
  { id: 'cappuccino-latte', label: 'Cappuccino Latte', group: 'light', colorScheme: 'light', tokens: { 'surface-0': '#eff1f5', 'surface-1': '#e6e9ef', 'surface-2': '#f5e9dd', 'surface-3': '#dce0e8', border: '#bcc0cc', text: '#4c4f69', muted: '#7c7f93', accent: '#8839ef', 'accent-soft': '#eadcff' } },
  { id: 'solarized-light', label: 'Solarized Light', group: 'light', colorScheme: 'light', tokens: { 'surface-0': '#fdf6e3', 'surface-1': '#eee8d5', 'surface-2': '#fdf6e3', 'surface-3': '#e6dfc9', border: '#c7c1ad', text: '#586e75', muted: '#839496', accent: '#268bd2', 'accent-soft': '#d9edf9' } },
];

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
