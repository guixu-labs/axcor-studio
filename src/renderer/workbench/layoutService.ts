import type { EditorGroupLayout } from './layout';
import { createEditorGroupLayout } from './layout';

export type WorkbenchPart = 'activityBar' | 'sidebar' | 'editor' | 'panel' | 'statusBar';

export interface WorkbenchLayoutState {
  activityBarVisible: boolean;
  sidebarVisible: boolean;
  panelVisible: boolean;
  statusBarVisible: boolean;
  editorLayout: EditorGroupLayout;
}

export const createWorkbenchLayout = (): WorkbenchLayoutState => ({
  activityBarVisible: true,
  sidebarVisible: true,
  panelVisible: true,
  statusBarVisible: true,
  editorLayout: createEditorGroupLayout(),
});

export const toggleWorkbenchPart = (state: WorkbenchLayoutState, part: WorkbenchPart): WorkbenchLayoutState => {
  if (part === 'activityBar') return { ...state, activityBarVisible: !state.activityBarVisible };
  if (part === 'sidebar') return { ...state, sidebarVisible: !state.sidebarVisible };
  if (part === 'panel') return { ...state, panelVisible: !state.panelVisible };
  if (part === 'statusBar') return { ...state, statusBarVisible: !state.statusBarVisible };
  return state;
};
