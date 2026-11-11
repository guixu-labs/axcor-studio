import { ipcMain } from 'electron';
import type { ProviderKeyInput } from '../shared/executionBackendIpc';
import type { CreateRunInput } from '../shared/protocol';
import { ensureInsightRunning, getInsightStatus } from '../observability/insightService';
import { subscribeExecutionEvents, unsubscribeExecutionEvents } from './events';
import {
  getRun,
  getRunSessions,
  getBackendBaseUrl,
  importSessionToInsight,
  injectSessionPrompt,
  listRuns,
  listSessionModels,
  sendSessionReply,
  setBackendBaseUrl,
  setSessionPaused,
  startWorkflowRun,
  startSessionRun,
  stopRun,
  listProviders,
  saveProviders,
  deleteProvider,
  activateProvider,
  testProvider,
  testProviderKey,
} from './http';

export function registerExecutionBackendIpc(): void {
  ipcMain.handle('execution:start-run', (_event, input: CreateRunInput) => input.runtime === 'session' ? startSessionRun(input) : startWorkflowRun(input));
  ipcMain.handle('execution:list-runs', () => listRuns());
  ipcMain.handle('execution:get-run', (_event, runId: string) => getRun(runId));
  ipcMain.handle('execution:stop-run', (_event, runId: string) => stopRun(runId));
  ipcMain.handle('execution:set-base-url', (_event, url: string) => { setBackendBaseUrl(url); });
  ipcMain.handle('execution:get-base-url', () => getBackendBaseUrl());
  ipcMain.handle('execution:get-run-sessions', (_event, runId: string) => getRunSessions(runId));
  ipcMain.handle('execution:inject-prompt', (_event, runId: string, sessionId: string, prompt: string) => injectSessionPrompt(runId, sessionId, prompt));
  ipcMain.handle('execution:set-session-paused', (_event, sessionId: string, paused: boolean) => setSessionPaused(sessionId, paused));
  ipcMain.handle('execution:send-session-reply', (_event, sessionId: string, text: string) => sendSessionReply(sessionId, text));
  ipcMain.handle('execution:import-to-insight', async (_event, sessionId: string) => {
    await ensureInsightRunning();
    return importSessionToInsight(sessionId);
  });
  ipcMain.handle('execution:insight-status', () => getInsightStatus());
  ipcMain.handle('execution:list-providers', () => listProviders());
  ipcMain.handle('execution:list-session-models', (_event, runtime: string) => listSessionModels(runtime));
  ipcMain.handle('execution:save-providers', (_event, keys: ProviderKeyInput[]) => saveProviders(keys));
  ipcMain.handle('execution:delete-provider', (_event, providerIndex: number) => deleteProvider(providerIndex));
  ipcMain.handle('execution:activate-provider', (_event, providerIndex: number) => activateProvider(providerIndex));
  ipcMain.handle('execution:test-provider', (_event, providerIndex: number) => testProvider(providerIndex));
  ipcMain.handle('execution:test-provider-key', (_event, key: string, model: string, baseUrl: string, runtime: string | undefined) => testProviderKey(key, model, baseUrl, runtime));
  ipcMain.on('execution:subscribe-events', (_event, runId: string) => subscribeExecutionEvents(runId));
  ipcMain.on('execution:unsubscribe-events', (_event, runId: string) => unsubscribeExecutionEvents(runId));
}
