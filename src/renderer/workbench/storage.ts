export const EXECUTION_BACKEND_URL_STORAGE_KEY = 'workbench.executionBackendUrl';

export function loadExecutionBackendUrl(): string | undefined {
  const url = loadWorkbenchState<unknown>(EXECUTION_BACKEND_URL_STORAGE_KEY, undefined)
    ?? loadWorkbenchState<unknown>('workbench.opsbotUrl', undefined);
  return typeof url === 'string' ? url : undefined;
}

export function loadWorkbenchState<T>(key: string, fallback: T): T {
  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) as T : fallback;
  } catch {
    return fallback;
  }
}

export function saveWorkbenchState<T>(key: string, value: T): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be unavailable in restricted or private renderer contexts.
  }
}
