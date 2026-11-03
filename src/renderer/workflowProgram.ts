export interface WorkflowFrontMatter {
  exists: boolean;
  format?: string;
  fields: Record<string, string>;
  error?: string;
}

export interface WorkflowProgramIssues {
  format?: string;
  error?: string;
}

const MAX_FRONT_MATTER_LINES = 60;

// Minimal YAML front matter for workflow programs: a leading `---` block of
// `key: value` lines. Opsbot rejects programs without a format field, so the
// only hard requirement we surface is the format declaration.
export function parseWorkflowFrontMatter(content: string): WorkflowFrontMatter {
  const lines = content.split(/\r?\n/);
  if (lines[0]?.trim() !== '---') return { exists: false, fields: {} };

  const endIndex = lines.slice(1, MAX_FRONT_MATTER_LINES + 1).findIndex(line => line.trim() === '---');
  if (endIndex === -1) {
    return { exists: true, fields: {}, error: 'front matter 未闭合（缺少结尾 ---）' };
  }

  const fields: Record<string, string> = {};
  for (const line of lines.slice(1, endIndex + 1)) {
    if (line.trim() === '') continue;
    const match = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line);
    if (!match) return { exists: true, fields, error: `无法解析的 front matter 行：${line.trim()}` };
    fields[match[1]] = match[2].trim();
  }

  return { exists: true, fields, format: fields['format'] };
}

export function workflowProgramIssues(content: string): WorkflowProgramIssues {
  const parsed = parseWorkflowFrontMatter(content);
  if (!parsed.exists) {
    return { error: '工作流程序需要在文件开头声明 front matter（--- 块）' };
  }
  if (parsed.error) return { error: parsed.error };
  if (!parsed.format) {
    return { error: '缺少 format 字段：工作流程序需要在 front matter 声明 format（如 format: graph-yaml@1）' };
  }
  return { format: parsed.format };
}
