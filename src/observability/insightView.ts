import { BrowserWindow, WebContentsView } from 'electron';
import { ensureInsightRunning, insightBaseUrl } from './insightService';

export interface InsightBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

let insightView: WebContentsView | null = null;
let insightVisible = false;
let insightDark = true;
let requestId = 0;

function applyTheme(view: WebContentsView): void {
  void view.webContents.executeJavaScript(`document.documentElement.classList.toggle('dark', ${insightDark})`).catch(() => {});
}

function ensureView(): WebContentsView {
  if (insightView) return insightView;
  const view = new WebContentsView({ webPreferences: { sandbox: true, contextIsolation: true } });
  view.setVisible(false);
  view.webContents.on('did-finish-load', () => applyTheme(view));
  for (const window of BrowserWindow.getAllWindows()) {
    window.contentView.addChildView(view);
  }
  insightView = view;
  return view;
}

export function attachInsightViewTo(window: BrowserWindow): void {
  const view = ensureView();
  if (!window.contentView.children.includes(view)) {
    window.contentView.addChildView(view);
  }
}

export async function showInsight(path: string, bounds: InsightBounds, isDark: boolean): Promise<void> {
  const view = ensureView();
  const request = ++requestId;
  const url = insightBaseUrl + (path.startsWith('/') ? path : '/' + path);
  insightDark = isDark;
  insightVisible = true;
  view.setBounds(bounds);
  try {
    await ensureInsightRunning();
    if (request !== requestId) return;
    if (view.webContents.getURL() !== url || view.webContents.isLoadingMainFrame()) {
      view.setVisible(false);
      await view.webContents.loadURL(url);
    }
    if (request !== requestId) return;
    applyTheme(view);
    view.setVisible(true);
  } catch (error) {
    if (request !== requestId) return;
    view.setVisible(false);
    const message = error instanceof Error ? error.message : String(error);
    console.error('[insight]', message);
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send('insight:load-failed', message);
    }
  }
}

export function updateInsightBounds(bounds: InsightBounds): void {
  if (!insightView || !insightVisible) return;
  insightView.setBounds(bounds);
}

export function hideInsight(): void {
  requestId++;
  if (!insightView) return;
  insightView.setVisible(false);
  insightVisible = false;
}
