import type { Run, RunEvent } from '../../shared/protocol';

export interface AppState {
  workspace?: string;
  file: string;
  content: string;
  run?: Run;
  events: RunEvent[];
}

export const initialAppState: AppState = {
  file: 'workflow.md',
  content: '# New workflow\n\nDescribe the workflow steps here.',
  events: [],
};
