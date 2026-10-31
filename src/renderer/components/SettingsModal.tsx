import { fonts, themes } from '../settings';

export type ThemeId = string;
export type FontId = string;

interface SettingsModalProps {
  theme: ThemeId;
  font: FontId;
  onThemeChange: (theme: ThemeId) => void;
  onFontChange: (font: FontId) => void;
  onClose: () => void;
}

function ChoiceList({ title, items, selected, onSelect }: { title: string; items: Array<{ id: string; label: string }>; selected: string; onSelect: (value: string) => void }): JSX.Element {
  return <section className="settings-section"><h2>{title}</h2><div className="choice-list">{items.map(item => <button className={'choice-item' + (item.id === selected ? ' selected' : '')} key={item.id} type="button" onClick={() => onSelect(item.id)}><span>{item.label}</span>{item.id === selected && <span className="choice-check" aria-label="Selected">✓</span>}</button>)}</div></section>;
}

export function SettingsModal({ theme, font, onThemeChange, onFontChange, onClose }: SettingsModalProps): JSX.Element {
  return <div className="settings-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <header className="settings-header"><div><span className="eyebrow">Preferences</span><h1 id="settings-title">Settings</h1><p>Personalize the workbench to match your flow.</p></div><button className="modal-close" type="button" onClick={onClose} aria-label="Close settings">×</button></header>
      <div className="settings-content"><ChoiceList title="Light themes" items={themes.filter(item => item.group === 'light')} selected={theme} onSelect={value => onThemeChange(value)} /><ChoiceList title="Dark themes" items={themes.filter(item => item.group === 'dark')} selected={theme} onSelect={value => onThemeChange(value)} /><ChoiceList title="Editor font" items={fonts} selected={font} onSelect={value => onFontChange(value)} /></div>
      <footer className="settings-footer"><span>Changes are saved automatically</span><button className="primary-button" type="button" onClick={onClose}>Done</button></footer>
    </section>
  </div>;
}
