import { DEFAULT_EXECUTION_BACKEND_URL, EXECUTION_BACKEND_COMMAND, EXECUTION_BACKEND_NAME } from '../shared/executionBackendConfig';
import type { RunStatus } from '../shared/protocol';

export type LocaleId = 'zh-CN' | 'en-US';

export interface Messages {
  brand: string; back: string; forward: string; search: string; openWorkspace: string; toggleSidebar: string;
  noWorkspace: string; workspaceReady: string; workbench: string; runs: string; settings: string;
  workspaceRequiredTitle: string; workspaceRequiredMessage: string;
  workspace: string; save: string; runWorkflow: string; markdown: string; splitVertical: string; splitHorizontal: string;
  monitorRuns: string; cancel: string; readyForRun: string; eventsCaptured: (count: number) => string;
  noRuns: string; runToSeeEvents: string; settingsDescription: string; appearance: string; lightThemes: string; darkThemes: string;
  editorFont: string; theme: string; language: string; general: string; savedAutomatically: string; done: string; selected: string;
  themeDescription: string; editorFontDescription: string; languageDescription: string; defaultBadge: string;
  selectRun: string; selectRunHint: string; executionBackendUrl: string; executionBackendUrlDescription: string;
  insight: string; insightHint: string; insightLoadFailed: string; openInInsight: string; noObservableSessions: string;
  backgroundImage: string; backgroundImageDescription: string; backgroundFit: string; backgroundFitDescription: string; fitCover: string; fitContain: string; chooseImage: string; removeImage: string;
  emptyWorkspace: string;
  graphAdvanced: string; cliWrapper: string; evaluator: string; reviewerModel: string; reviewerProviderIndex: string;
  reviewerTaskGoal: string; reviewerThinking: string; reviewerThinkingBudget: string; modelPinned: string;
  runProgramPath: string; graphDefault: string; graphReviewer: string; enabled: string; disabled: string;
  runConfig: string; runtime: string; runLabel: string; runLabelPlaceholder: string; graphVariables: string; addGraphVariable: string; paramKeyPlaceholder: string; paramValuePlaceholder: string; maxParallel: string; removeGraphVariable: string;
  agentRuntime: string; sessionPrompt: string; sessionModel: string; sessionSystemPrompt: string; sessionMaxIterations: string; sessionReviewerEnabled: string;
  runDetail: {
    log: string; waiting: string; overview: string; id: string; iteration: string; elapsed: string;
    members: string; running: string; createdAt: string; context: string;
    input: string; output: string; cacheRead: string; cacheWrite: string; free: string; thinking: string;
    sessionReply: string; sendReply: string; pauseSession: string; resumeSession: string;
    stop: string; stopSessionTitle: string; stopSessionMessage: string; stopRunTitle: string; stopRunMessage: string;
    status: Record<RunStatus, string>;
    subagents: string; mainAgent: string; subagentDispatched: string; subagentCall: string; subagentEvents: Record<string, string>;
    assistant: string; user: string; toolCall: string; toolInput: string; toolResult: string; toolReturned: string; notification: string;
  };
  sessionSelectModel: string; sessionModelsLoading: string; sessionModelsUnavailable: string; sessionModelsEmpty: string;
  prompt: string; promptPlaceholder: string;
  providers: string; providersDescription: string; providerKey: string; providerModel: string; providerBaseUrl: string; providerRuntime: string;
  providerActive: string; providerValidated: string; providerFailed: string; providerUntested: string; addProvider: string; testKey: string; saveProviders: string;
  providerTestPassed: string; providerTestFailed: string; providerSaved: string; providerDeleted: string; providerName: string;
  providersExisting: string; add: string;
}

export const messages: Record<LocaleId, Messages> = {
  'zh-CN': {
    workspaceRequiredTitle: '选择工作区', workspaceRequiredMessage: '运行工作流需要先选择工作区。',
    runDetail: {
      log: '运行日志', waiting: '等待运行事件…', overview: '概览', id: '运行 ID', iteration: '迭代', elapsed: '耗时',
      members: '成员会话', running: '运行中', createdAt: '创建时间', context: '上下文用量',
      input: '输入', output: '输出', cacheRead: '缓存读取', cacheWrite: '缓存写入', free: '剩余用量', thinking: '思考',
      sessionReply: '人工回复', sendReply: '发送', pauseSession: '暂停', resumeSession: '继续',
      stop: '停止', stopSessionTitle: '停止会话？', stopSessionMessage: '停止后，无法再向此会话发送回复。已有日志仍可查看。',
      stopRunTitle: '停止工作流？', stopRunMessage: '停止后，本次工作流将结束。已有日志仍可查看。',
      status: { queued: '排队中', running: '运行中', paused: '已暂停', failed: '失败', completed: '已完成', cancelled: '已停止' },
      subagents: '子代理', mainAgent: '主代理', subagentDispatched: '已调用', subagentCall: '子代理调用',
      assistant: '助手消息', user: '用户消息', toolCall: '工具调用', toolInput: '参数', toolResult: '结果', toolReturned: '已返回', notification: '通知',
      subagentEvents: { subagent_start: '子代理启动', subagent_progress: '子代理进度', subagent_stop: '子代理结束', subagent_context: '子代理上下文' },
    },
    graphAdvanced: '高级参数', cliWrapper: 'CLI 包装命令', evaluator: '评估器', reviewerModel: 'Reviewer 模型', reviewerProviderIndex: 'Reviewer 供应商索引', reviewerTaskGoal: 'Reviewer 目标', reviewerThinking: 'Reviewer 思考', reviewerThinkingBudget: 'Reviewer 思考预算', modelPinned: '固定模型',
    brand: 'axcor-studio', back: '后退', forward: '前进', search: '搜索文件和命令', openWorkspace: '打开工作区', toggleSidebar: '切换侧边栏', noWorkspace: '未选择工作区', workspaceReady: '工作区已就绪', workbench: '工作台', runs: '运行', settings: '设置', workspace: '工作区', save: '保存', runWorkflow: '运行工作流', markdown: 'Markdown', splitVertical: '左右拆分编辑器', splitHorizontal: '上下拆分编辑器', monitorRuns: '查看工作流运行状态和执行证据。', cancel: '取消', readyForRun: '准备开始新的运行', eventsCaptured: count => `${count} 条日志`, noRuns: '暂无运行记录', runToSeeEvents: '运行工作流后，执行事件会显示在这里。', settingsDescription: '调整工作台的主题和字体。', appearance: '外观', lightThemes: '浅色主题', darkThemes: '深色主题', editorFont: '编辑器字体', theme: '主题', language: '语言', general: '常规', savedAutomatically: '更改会自动保存', done: '完成', selected: '已选择', themeDescription: '选择工作台使用的颜色主题，界面、编辑器和面板会同步切换。', editorFontDescription: '设置编辑器正文使用的字体，影响所有 Markdown 编辑区域。', languageDescription: '设置工作台界面语言，更改后会立即生效。', defaultBadge: '默认', selectRun: '未选择运行', selectRunHint: '在左侧运行列表选择一条记录，查看执行详情。', executionBackendUrl: `${EXECUTION_BACKEND_NAME} 地址`, executionBackendUrlDescription: `执行后端 ${EXECUTION_BACKEND_NAME} 的 HTTP 地址（默认 ${DEFAULT_EXECUTION_BACKEND_URL}）。`, insight: '观测', insightHint: `Insight 观测视图加载中。若长时间无响应，请确认 ${EXECUTION_BACKEND_NAME} 已启动（${EXECUTION_BACKEND_COMMAND} web --insight）。`, insightLoadFailed: `观测视图加载失败：${EXECUTION_BACKEND_NAME} 或 Insight 可能未运行。`, openInInsight: '在 Insight 中查看', noObservableSessions: '该运行没有可观测的会话', backgroundImage: '背景图', backgroundImageDescription: '文件区和运行区空态共用的背景图，支持常见图片格式（不超过 3MB）。', backgroundFit: '背景图显示方式', backgroundFitDescription: '选择背景图在文件区和运行区空态的显示方式。', fitCover: '铺满', fitContain: '完整显示', chooseImage: '选择图片', removeImage: '移除', emptyWorkspace: '工作区为空', runProgramPath: '运行文件', graphDefault: '使用 Graph 配置', graphReviewer: 'Reviewer', enabled: '启用', disabled: '禁用', runConfig: '运行配置', runtime: '运行时', runLabel: '运行名称', runLabelPlaceholder: '默认使用文件名', graphVariables: '工作流变量', addGraphVariable: '添加变量', paramKeyPlaceholder: '键', paramValuePlaceholder: '值', maxParallel: '最大并行数', removeGraphVariable: '移除变量', agentRuntime: 'Agent 运行时', sessionPrompt: '提示词', sessionModel: '模型', sessionSelectModel: '请选择模型', sessionModelsLoading: '正在加载模型…', sessionModelsUnavailable: '无法加载模型列表', sessionModelsEmpty: '该运行时没有可用模型', sessionSystemPrompt: '系统提示词', sessionMaxIterations: '最大迭代', sessionReviewerEnabled: '启用 Reviewer', prompt: '提示词', promptPlaceholder: '可选的工作流初始提示词', providers: '模型供应商', providersDescription: `配置 ${EXECUTION_BACKEND_NAME} 的模型供应商密钥与端点，供会话运行使用。`, providerKey: 'API 密钥', providerModel: '模型', providerBaseUrl: '地址', providerRuntime: '运行时', providerActive: '使用', providerValidated: '校验通过', providerFailed: '校验失败', providerUntested: '未校验', addProvider: '添加供应商', testKey: '测试', saveProviders: '保存供应商', providerTestPassed: '测试通过', providerTestFailed: '测试失败', providerSaved: '供应商已保存', providerDeleted: '供应商已删除', providerName: '显示名称', providersExisting: '已有供应商', add: '添加',
  },
  'en-US': {
    workspaceRequiredTitle: 'Choose a workspace', workspaceRequiredMessage: 'Choose a workspace before running a workflow.',
    runDetail: {
      log: 'Run log', waiting: 'Waiting for run events…', overview: 'Overview', id: 'Run ID', iteration: 'Iteration', elapsed: 'Elapsed',
      members: 'Member sessions', running: 'Running', createdAt: 'Created', context: 'Context usage',
      input: 'Input', output: 'Output', cacheRead: 'Cache read', cacheWrite: 'Cache write', free: 'Remaining tokens', thinking: 'Thinking',
      sessionReply: 'Manual reply', sendReply: 'Send', pauseSession: 'Pause', resumeSession: 'Resume',
      stop: 'Stop', stopSessionTitle: 'Stop session?', stopSessionMessage: 'After stopping, you can no longer reply to this session. Its existing logs remain available.',
      stopRunTitle: 'Stop workflow?', stopRunMessage: 'Stopping ends this workflow run. Its existing logs remain available.',
      status: { queued: 'Queued', running: 'Running', paused: 'Paused', failed: 'Failed', completed: 'Completed', cancelled: 'Stopped' },
      subagents: 'Subagents', mainAgent: 'Main agent', subagentDispatched: 'Dispatched', subagentCall: 'Subagent call',
      assistant: 'Assistant message', user: 'User message', toolCall: 'Tool call', toolInput: 'Input', toolResult: 'Result', toolReturned: 'Returned', notification: 'Notification',
      subagentEvents: { subagent_start: 'Subagent started', subagent_progress: 'Subagent progress', subagent_stop: 'Subagent stopped', subagent_context: 'Subagent context' },
    },
    graphAdvanced: 'Advanced parameters', cliWrapper: 'CLI wrapper', evaluator: 'Evaluator', reviewerModel: 'Reviewer model', reviewerProviderIndex: 'Reviewer provider index', reviewerTaskGoal: 'Reviewer task goal', reviewerThinking: 'Reviewer thinking', reviewerThinkingBudget: 'Reviewer thinking budget', modelPinned: 'Pin model',
    brand: 'axcor-studio', back: 'Back', forward: 'Forward', search: 'Search files and commands', openWorkspace: 'Open workspace', toggleSidebar: 'Toggle sidebar', noWorkspace: 'No workspace selected', workspaceReady: 'Workspace ready', workbench: 'Workbench', runs: 'Runs', settings: 'Settings', workspace: 'Workspace', save: 'Save', runWorkflow: 'Run workflow', markdown: 'Markdown', splitVertical: 'Split editor left or right', splitHorizontal: 'Split editor up or down', monitorRuns: 'Monitor workflow activity and inspect evidence.', cancel: 'Cancel', readyForRun: 'Ready for a new run', eventsCaptured: count => `${count} log entries`, noRuns: 'No runs yet', runToSeeEvents: 'Run your workflow to see live execution events here.', settingsDescription: 'Personalize the workbench theme and font.', appearance: 'Appearance', lightThemes: 'Light themes', darkThemes: 'Dark themes', editorFont: 'Editor font', theme: 'Theme', language: 'Language', general: 'General', savedAutomatically: 'Changes are saved automatically', done: 'Done', selected: 'Selected', themeDescription: 'Choose the color theme used by the workbench, editors and panels.', editorFontDescription: 'Set the font family used for Markdown editor content.', languageDescription: 'Set the display language of the workbench. Changes apply immediately.', defaultBadge: 'Default', selectRun: 'No run selected', selectRunHint: 'Select a run in the list on the left to view its details.', executionBackendUrl: `${EXECUTION_BACKEND_NAME} URL`, executionBackendUrlDescription: `HTTP address of the ${EXECUTION_BACKEND_NAME} execution backend (default ${DEFAULT_EXECUTION_BACKEND_URL}).`, insight: 'Insight', insightHint: `Loading the Insight observability view. If nothing shows up, make sure ${EXECUTION_BACKEND_NAME} is running (${EXECUTION_BACKEND_COMMAND} web --insight).`, insightLoadFailed: `The observability view failed to load: ${EXECUTION_BACKEND_NAME} or Insight may not be running.`, openInInsight: 'Open in Insight', noObservableSessions: 'This run has no observable sessions', backgroundImage: 'Background image', backgroundImageDescription: 'Background image for empty file and run views. Common image formats, up to 3MB.', backgroundFit: 'Background fit', backgroundFitDescription: 'How the background image fits the empty file and run views.', fitCover: 'Cover', fitContain: 'Contain', chooseImage: 'Choose image', removeImage: 'Remove', emptyWorkspace: 'Workspace is empty', runProgramPath: 'Program file', graphDefault: 'Use Graph configuration', graphReviewer: 'Reviewer', enabled: 'Enabled', disabled: 'Disabled', runConfig: 'Run configuration', runtime: 'Runtime', runLabel: 'Run label', runLabelPlaceholder: 'Defaults to the file name', graphVariables: 'Workflow variables', addGraphVariable: 'Add variable', paramKeyPlaceholder: 'Key', paramValuePlaceholder: 'Value', maxParallel: 'Max parallel', removeGraphVariable: 'Remove variable', agentRuntime: 'Agent runtime', sessionPrompt: 'Prompt', sessionModel: 'Model', sessionSelectModel: 'Select a model', sessionModelsLoading: 'Loading models…', sessionModelsUnavailable: 'Could not load models', sessionModelsEmpty: 'No models available for this runtime', sessionSystemPrompt: 'System prompt', sessionMaxIterations: 'Max iterations', sessionReviewerEnabled: 'Enable reviewer', prompt: 'Prompt', promptPlaceholder: 'Optional initial prompt for the workflow', providers: 'Providers', providersDescription: `Configure the ${EXECUTION_BACKEND_NAME} model provider keys and endpoints used by session runs.`, providerKey: 'API key', providerModel: 'Model', providerBaseUrl: 'Base URL', providerRuntime: 'Runtime', providerActive: 'Use', providerValidated: 'Validated', providerFailed: 'Validation failed', providerUntested: 'Untested', addProvider: 'Add provider', testKey: 'Test', saveProviders: 'Save providers', providerTestPassed: 'Test passed', providerTestFailed: 'Test failed', providerSaved: 'Providers saved', providerDeleted: 'Provider deleted', providerName: 'Display name', providersExisting: 'Existing providers', add: 'Add',
  },
};

export const localeOptions: Array<{ id: LocaleId; label: string }> = [{ id: 'zh-CN', label: '中文' }, { id: 'en-US', label: 'English' }];
