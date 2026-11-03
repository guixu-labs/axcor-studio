import { BrowserWindow, WebContentsView } from 'electron';
import { getOpsbotBaseUrl } from './opsbotHttp';

export interface InsightBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

let insightView: WebContentsView | null = null;
let insightVisible = false;
let insightPath = '/insight/';
let loadedPath = '';
let insightDark = true;

function ensureView(): WebContentsView {
  if (insightView) return insightView;
  const view = new WebContentsView({ webPreferences: { sandbox: true, contextIsolation: true } });
  view.setVisible(false);
  view.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`[insight] failed to load ${validatedURL}: ${errorCode} ${errorDescription}`);
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send('insight:load-failed', errorDescription);
    }
  });
  view.webContents.on('did-finish-load', () => {
    void view.webContents.executeJavaScript(`document.documentElement.classList.toggle('dark', ${insightDark})`).catch(() => {});
  });
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

export function showInsight(path: string, bounds: InsightBounds, isDark: boolean): void {
  const view = ensureView();
  insightPath = path.startsWith('/') ? path : '/' + path;
  insightDark = isDark;
  view.setBounds(bounds);
  if (insightPath !== loadedPath) {
    loadedPath = insightPath;
    void view.webContents.loadURL(getOpsbotBaseUrl() + insightPath).catch(() => {});
  }
  view.setVisible(true);
  insightVisible = true;
}

export function updateInsightBounds(bounds: InsightBounds): void {
  if (!insightView || !insightVisible) return;
  insightView.setBounds(bounds);
}

export function hideInsight(): void {
  if (!insightView) return;
  insightView.setVisible(false);
  insightVisible = false;
}
