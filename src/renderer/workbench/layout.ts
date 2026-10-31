export type EditorGroupOrientation = 'horizontal' | 'vertical';

export interface EditorGroupNode {
  id?: string;
  size?: number;
  groups?: EditorGroupNode[];
}

export interface EditorGroupLayout {
  orientation: EditorGroupOrientation;
  groups: EditorGroupNode[];
}

export const createEditorGroupLayout = (): EditorGroupLayout => ({
  orientation: 'vertical',
  groups: [{ id: 'editor-group-1' }],
});

export const splitEditorGroup = (
  layout: EditorGroupLayout,
  orientation: EditorGroupOrientation,
): EditorGroupLayout => {
  if (layout.groups.length > 1 && layout.orientation === orientation) {
    return { ...layout, groups: layout.groups.slice(0, 1) };
  }
  return {
    orientation,
    groups: layout.groups.length > 1 ? layout.groups : [...layout.groups, { id: 'editor-group-2' }],
  };
};
