import { useState } from 'react';
import type { SessionModelOption } from '../../shared/executionBackendIpc';
import type { GraphRunParams, Run, RuntimeId } from '../../shared/protocol';
import { RUNTIMES } from '../../shared/protocol';

export interface RunsPanelMessages {
  runs: string; runWorkflow: string;
  noRuns: string; runToSeeEvents: string;
  runConfig: string; runtime: string; runLabel: string; runLabelPlaceholder: string;
  runProgramPath: string; graphDefault: string; graphReviewer: string; enabled: string; disabled: string;
  graphAdvanced: string; cliWrapper: string; evaluator: string; reviewerModel: string; reviewerProviderIndex: string;
  reviewerTaskGoal: string; reviewerThinking: string; reviewerThinkingBudget: string; modelPinned: string;
  graphVariables: string; addGraphVariable: string; paramKeyPlaceholder: string; paramValuePlaceholder: string;
  maxParallel: string; removeGraphVariable: string;
  agentRuntime: string; sessionPrompt: string; sessionModel: string; sessionSystemPrompt: string;
  sessionMaxIterations: string; sessionReviewerEnabled: string;
  prompt: string; promptPlaceholder: string;
}

export interface GraphVariableRow { key: string; value: string; }

const AGENT_RUNTIME_OPTIONS = [
  { id: 'claude_sdk', label: 'Claude SDK' },
  { id: 'claude_cli', label: 'Claude CLI' },
  { id: 'opencode', label: 'OpenCode' },
  { id: 'codex_cli', label: 'Codex CLI' },
];

interface RunsListProps {
  runs: Run[];
  selectedRunId?: string;
  error?: string;
  onSelectRun: (runId: string) => void;
  onRun: () => void;
  runDisabled?: boolean;
  runtime: RuntimeId;
  onRuntimeChange: (runtime: RuntimeId) => void;
  runLabel: string;
  onRunLabelChange: (value: string) => void;
  runProgramPath: string;
  defaultProgramPath: string;
  onRunProgramPathChange: (value: string) => void;
  graphVariables: GraphVariableRow[];
  onGraphVariablesChange: (rows: GraphVariableRow[]) => void;
  graphOptions: GraphRunParams;
  onGraphOptionsChange: (options: GraphRunParams) => void;
  maxParallel: string;
  onMaxParallelChange: (value: string) => void;
  runPrompt: string;
  onRunPromptChange: (value: string) => void;
  sessionPrompt: string;
  onSessionPromptChange: (value: string) => void;
  sessionRuntime: string;
  onSessionRuntimeChange: (value: string) => void;
  sessionModel: string;
  sessionModels: SessionModelOption[];
  sessionModelPlaceholder: string;
  onSessionModelChange: (value: string) => void;
  sessionSystemPrompt: string;
  onSessionSystemPromptChange: (value: string) => void;
  sessionMaxIterations: string;
  onSessionMaxIterationsChange: (value: string) => void;
  sessionReviewerEnabled: boolean;
  onSessionReviewerEnabledChange: (value: boolean) => void;
  messages: RunsPanelMessages;
}

export function RunsList({ runs, selectedRunId, error, onSelectRun, onRun, runDisabled, runtime, onRuntimeChange, runLabel, onRunLabelChange, runProgramPath, defaultProgramPath, onRunProgramPathChange, graphVariables, onGraphVariablesChange, graphOptions, onGraphOptionsChange, maxParallel, onMaxParallelChange, runPrompt, onRunPromptChange, sessionPrompt, onSessionPromptChange, sessionRuntime, onSessionRuntimeChange, sessionModel, sessionModels, sessionModelPlaceholder, onSessionModelChange, sessionSystemPrompt, onSessionSystemPromptChange, sessionMaxIterations, onSessionMaxIterationsChange, sessionReviewerEnabled, onSessionReviewerEnabledChange, messages }: RunsListProps): JSX.Element {
  const [configOpen, setConfigOpen] = useState(true);
  return <aside className="runs-panel">
    <div className="explorer-heading"><h2>{messages.runs}</h2></div>
    <div className="run-list" role="listbox" aria-label={messages.runs}>
      {runs.length ? runs.map(run => <button
        className={'run-entry' + (run.id === selectedRunId ? ' active' : '')}
        role="option"
        aria-selected={run.id === selectedRunId}
        key={run.id}
        type="button"
        onClick={() => onSelectRun(run.id)}
      >
        <i className={'run-dot ' + run.status} aria-hidden="true" />
        <span className="run-entry-title">{run.workflowId}</span>
        <small>{new Date(run.createdAt).toLocaleTimeString()}</small>
      </button>) : <div className="run-list-empty"><strong>{messages.noRuns}</strong><p>{messages.runToSeeEvents}</p></div>}
      {error && <p className="run-list-error" role="alert">{error}</p>}
    </div>
    <div className="run-config">
      <button className="run-config-toggle" type="button" aria-expanded={configOpen} onClick={() => setConfigOpen(open => !open)}>
        <span className="run-config-arrow" aria-hidden="true">{configOpen ? '▾' : '▸'}</span>{messages.runConfig}
      </button>
      {configOpen && <>
        <label className="run-config-field">
          <span className="run-config-title">{messages.runtime}</span>
          <select className="run-config-select" value={runtime} aria-label={messages.runtime} onChange={event => onRuntimeChange(event.target.value as RuntimeId)}>
            {RUNTIMES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        {runtime === 'workflow' && <>
          <label className="run-config-field">
            <span className="run-config-title">{messages.runProgramPath}</span>
            <input className="run-config-input" type="text" value={runProgramPath} placeholder={defaultProgramPath} aria-label={messages.runProgramPath} onChange={event => onRunProgramPathChange(event.target.value)} onKeyDown={event => {
              if (event.key === 'Tab' && !event.shiftKey && !event.currentTarget.value && defaultProgramPath) onRunProgramPathChange(defaultProgramPath);
            }} />
          </label>
          <label className="run-config-field">
            <span className="run-config-title">{messages.runLabel}</span>
            <input className="run-config-input" type="text" value={runLabel} placeholder={messages.runLabelPlaceholder} aria-label={messages.runLabel} onChange={event => onRunLabelChange(event.target.value)} />
          </label>
          <div className="run-config-field">
            <div className="run-params-heading">
              <span className="run-config-title">{messages.graphVariables}</span>
              <button className="icon-button run-param-add" type="button" aria-label={messages.addGraphVariable} title={messages.addGraphVariable} onClick={() => onGraphVariablesChange([...graphVariables, { key: '', value: '' }])}>+</button>
            </div>
            {graphVariables.map((row, index) => <div className="run-param-row" key={index}>
              <input className="run-config-input" type="text" value={row.key} placeholder={messages.paramKeyPlaceholder} aria-label={messages.paramKeyPlaceholder} onChange={event => onGraphVariablesChange(graphVariables.map((item, itemIndex) => itemIndex === index ? { ...item, key: event.target.value } : item))} />
              <input className="run-config-input" type="text" value={row.value} placeholder={messages.paramValuePlaceholder} aria-label={messages.paramValuePlaceholder} onChange={event => onGraphVariablesChange(graphVariables.map((item, itemIndex) => itemIndex === index ? { ...item, value: event.target.value } : item))} />
              <button className="run-param-remove" type="button" aria-label={messages.removeGraphVariable} onClick={() => onGraphVariablesChange(graphVariables.filter((_item, itemIndex) => itemIndex !== index))}>×</button>
            </div>)}
          </div>
          <label className="run-config-field">
            <span className="run-config-title">{messages.maxParallel}</span>
            <input className="run-config-input" type="number" min={1} value={maxParallel} aria-label={messages.maxParallel} onChange={event => onMaxParallelChange(event.target.value)} />
          </label>
          <label className="run-config-field">
            <span className="run-config-title">{messages.prompt}</span>
            <textarea className="run-config-input run-config-textarea" rows={3} value={runPrompt} placeholder={messages.promptPlaceholder} aria-label={messages.prompt} onChange={event => onRunPromptChange(event.target.value)} />
          </label>
          <label className="run-config-field">
            <span className="run-config-title">{messages.agentRuntime}</span>
            <select className="run-config-select" aria-label={messages.agentRuntime} value={graphOptions.runtime ?? ''} onChange={event => onGraphOptionsChange({ ...graphOptions, runtime: event.target.value || undefined })}>
              <option value="">{messages.graphDefault}</option>
              {AGENT_RUNTIME_OPTIONS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
          {graphOptions.runtime && <label className="run-config-field">
            <span className="run-config-title">{messages.sessionModel}</span>
            <select className="run-config-select" aria-label={messages.sessionModel} value={sessionModel} onChange={event => onSessionModelChange(event.target.value)}>
              <option value="">{messages.graphDefault}</option>
              {sessionModels.map(option => <option key={option.model} value={option.model}>{option.model}</option>)}
            </select>
          </label>}
          <label className="run-config-field">
            <span className="run-config-title">{messages.sessionSystemPrompt}</span>
            <textarea className="run-config-input run-config-textarea" rows={3} value={graphOptions.system_prompt ?? ''} onChange={event => onGraphOptionsChange({ ...graphOptions, system_prompt: event.target.value || undefined })} />
          </label>
          <label className="run-config-field">
            <span className="run-config-title">{messages.sessionMaxIterations}</span>
            <input className="run-config-input" type="number" min={1} value={graphOptions.max_iterations ?? ''} onChange={event => onGraphOptionsChange({ ...graphOptions, max_iterations: event.target.valueAsNumber || undefined })} />
          </label>
          <label className="run-config-field">
            <span className="run-config-title">{messages.graphReviewer}</span>
            <select className="run-config-select" aria-label={messages.graphReviewer} value={graphOptions.reviewer_enabled === undefined ? '' : String(graphOptions.reviewer_enabled)} onChange={event => {
              const value = event.target.value;
              onGraphOptionsChange({ ...graphOptions, reviewer_enabled: value === '' ? undefined : value === 'true' });
            }}>
              <option value="">{messages.graphDefault}</option>
              <option value="true">{messages.enabled}</option>
              <option value="false">{messages.disabled}</option>
            </select>
          </label>
          <details>
            <summary className="run-config-title">{messages.graphAdvanced}</summary>
            <div className="graph-advanced-fields">
              {([
                ['cli_wrapper', messages.cliWrapper],
                ['evaluator', messages.evaluator],
                ['reviewer_model', messages.reviewerModel],
                ['reviewer_task_goal', messages.reviewerTaskGoal],
              ] as const).map(([key, label]) => <label className="run-config-field" key={key}>
                <span className="run-config-title">{label}</span>
                <input className="run-config-input" type="text" value={graphOptions[key] ?? ''} onChange={event => onGraphOptionsChange({ ...graphOptions, [key]: event.target.value || undefined })} />
              </label>)}
              {([
                ['reviewer_provider_index', messages.reviewerProviderIndex],
                ['reviewer_thinking_budget_tokens', messages.reviewerThinkingBudget],
              ] as const).map(([key, label]) => <label className="run-config-field" key={key}>
                <span className="run-config-title">{label}</span>
                <input className="run-config-input" type="number" min={0} value={graphOptions[key] ?? ''} onChange={event => {
                  const value = event.target.valueAsNumber;
                  onGraphOptionsChange({ ...graphOptions, [key]: Number.isNaN(value) ? undefined : value });
                }} />
              </label>)}
              {([
                ['reviewer_thinking_enabled', messages.reviewerThinking],
                ['model_pinned', messages.modelPinned],
              ] as const).map(([key, label]) => <label className="run-config-field" key={key}>
                <span className="run-config-title">{label}</span>
                <select className="run-config-select" aria-label={label} value={String(graphOptions[key] ?? '')} onChange={event => {
                  const value = event.target.value;
                  onGraphOptionsChange({ ...graphOptions, [key]: value === '' ? undefined : value === 'true' });
                }}>
                  <option value="">{messages.graphDefault}</option>
                  <option value="true">{messages.enabled}</option>
                  <option value="false">{messages.disabled}</option>
                </select>
              </label>)}
            </div>
          </details>
        </>}
        {runtime === 'session' && <>
          <label className="run-config-field">
            <span className="run-config-title">{messages.sessionPrompt}</span>
            <textarea className="run-config-input run-config-textarea" rows={4} value={sessionPrompt} aria-label={messages.sessionPrompt} onChange={event => onSessionPromptChange(event.target.value)} />
          </label>
          <label className="run-config-field">
            <span className="run-config-title">{messages.agentRuntime}</span>
            <select className="run-config-select" value={sessionRuntime} aria-label={messages.agentRuntime} onChange={event => onSessionRuntimeChange(event.target.value)}>
              {AGENT_RUNTIME_OPTIONS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
          <label className="run-config-field">
            <span className="run-config-title">{messages.sessionModel}</span>
            <select className="run-config-select" value={sessionModel} aria-label={messages.sessionModel} disabled={!sessionModels.length} onChange={event => onSessionModelChange(event.target.value)}>
              <option value="" disabled hidden={sessionModels.length > 0}>{sessionModelPlaceholder}</option>
              {sessionModels.map(option => <option key={option.model} value={option.model}>{option.model}</option>)}
            </select>
          </label>
          <label className="run-config-field">
            <span className="run-config-title">{messages.sessionSystemPrompt}</span>
            <textarea className="run-config-input run-config-textarea" rows={3} value={sessionSystemPrompt} aria-label={messages.sessionSystemPrompt} onChange={event => onSessionSystemPromptChange(event.target.value)} />
          </label>
          <label className="run-config-field">
            <span className="run-config-title">{messages.sessionMaxIterations}</span>
            <input className="run-config-input" type="number" min={1} value={sessionMaxIterations} aria-label={messages.sessionMaxIterations} onChange={event => onSessionMaxIterationsChange(event.target.value)} />
          </label>
          <label className="run-config-field run-config-check">
            <input type="checkbox" checked={sessionReviewerEnabled} aria-label={messages.sessionReviewerEnabled} onChange={event => onSessionReviewerEnabledChange(event.target.checked)} />
            <span className="run-config-title">{messages.sessionReviewerEnabled}</span>
          </label>
        </>}
      </>}
    </div>
    <button className="run-action" type="button" disabled={runDisabled || (runtime === 'session' && !sessionModel)} onClick={onRun}><span>{messages.runWorkflow}</span><b>⌘ ↵</b></button>
  </aside>;
}
