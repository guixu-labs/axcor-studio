export type LocaleId = 'zh-CN' | 'en-US';

export interface Messages {
  brand: string; back: string; forward: string; search: string; openWorkspace: string; toggleSidebar: string;
  noWorkspace: string; workspaceReady: string; workbench: string; runs: string; settings: string;
  files: string; save: string; runWorkflow: string; markdown: string; splitVertical: string; splitHorizontal: string;
  executionCenter: string; monitorRuns: string; cancel: string; readyForRun: string; eventsCaptured: (count: number) => string;
  noRuns: string; runToSeeEvents: string; settingsDescription: string; appearance: string; lightThemes: string; darkThemes: string;
  editorFont: string; theme: string; language: string; general: string; savedAutomatically: string; done: string; selected: string;
  themeDescription: string; editorFontDescription: string; languageDescription: string; defaultBadge: string;
  selectRun: string; selectRunHint: string;
}

export const messages: Record<LocaleId, Messages> = {
  'zh-CN': {
    brand: 'Agent Workbench', back: '后退', forward: '前进', search: '搜索文件和命令', openWorkspace: '打开工作区', toggleSidebar: '切换侧边栏', noWorkspace: '未选择工作区', workspaceReady: '工作区已就绪', workbench: '工作台', runs: '运行', settings: '设置', files: '文件', save: '保存', runWorkflow: '运行工作流', markdown: 'Markdown', splitVertical: '左右拆分编辑器', splitHorizontal: '上下拆分编辑器', executionCenter: '执行中心', monitorRuns: '查看工作流运行状态和执行证据。', cancel: '取消', readyForRun: '准备开始新的运行', eventsCaptured: count => `已捕获 ${count} 个事件`, noRuns: '暂无运行记录', runToSeeEvents: '运行工作流后，执行事件会显示在这里。', settingsDescription: '调整工作台的主题和字体。', appearance: '外观', lightThemes: '浅色主题', darkThemes: '深色主题', editorFont: '编辑器字体', theme: '主题', language: '语言', general: '常规', savedAutomatically: '更改会自动保存', done: '完成', selected: '已选择', themeDescription: '选择工作台使用的颜色主题，界面、编辑器和面板会同步切换。', editorFontDescription: '设置编辑器正文使用的字体，影响所有 Markdown 编辑区域。', languageDescription: '设置工作台界面语言，更改后会立即生效。', defaultBadge: '默认', selectRun: '未选择运行', selectRunHint: '在左侧执行中心选择一个运行，查看执行详情。',
  },
  'en-US': {
    brand: 'Agent Workbench', back: 'Back', forward: 'Forward', search: 'Search files and commands', openWorkspace: 'Open workspace', toggleSidebar: 'Toggle sidebar', noWorkspace: 'No workspace selected', workspaceReady: 'Workspace ready', workbench: 'Workbench', runs: 'Runs', settings: 'Settings', files: 'Files', save: 'Save', runWorkflow: 'Run workflow', markdown: 'Markdown', splitVertical: 'Split editor left or right', splitHorizontal: 'Split editor up or down', executionCenter: 'Execution center', monitorRuns: 'Monitor workflow activity and inspect evidence.', cancel: 'Cancel', readyForRun: 'Ready for a new run', eventsCaptured: count => `${count} events captured`, noRuns: 'No runs yet', runToSeeEvents: 'Run your workflow to see live execution events here.', settingsDescription: 'Personalize the workbench theme and font.', appearance: 'Appearance', lightThemes: 'Light themes', darkThemes: 'Dark themes', editorFont: 'Editor font', theme: 'Theme', language: 'Language', general: 'General', savedAutomatically: 'Changes are saved automatically', done: 'Done', selected: 'Selected', themeDescription: 'Choose the color theme used by the workbench, editors and panels.', editorFontDescription: 'Set the font family used for Markdown editor content.', languageDescription: 'Set the display language of the workbench. Changes apply immediately.', defaultBadge: 'Default', selectRun: 'No run selected', selectRunHint: 'Select a run in the execution center on the left to view its details.',
  },
};

export const localeOptions: Array<{ id: LocaleId; label: string }> = [{ id: 'zh-CN', label: '中文' }, { id: 'en-US', label: 'English' }];
