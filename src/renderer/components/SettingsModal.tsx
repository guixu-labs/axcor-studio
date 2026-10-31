import { fonts, themes } from '../settings';
import { useState } from 'react';

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

const categories = ['外观'];

export function SettingsModal({ theme, font, onThemeChange, onFontChange, onClose }: SettingsModalProps): JSX.Element {
  const [activeCategory, setActiveCategory] = useState('外观');
  return <div className="settings-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <header className="settings-header"><div className="settings-title"><span className="settings-title-icon">☷</span><h1 id="settings-title">Settings</h1></div><button className="modal-close" type="button" onClick={onClose} aria-label="Close settings">×</button></header>
      <div className="settings-layout"><nav className="settings-nav" aria-label="Settings categories">{categories.map(category => <button className={'settings-nav-item' + (activeCategory === category ? ' active' : '')} key={category} type="button" onClick={() => setActiveCategory(category)}>{category}<span aria-hidden="true">›</span></button>)}</nav><div className="settings-content"><div className="settings-content-header"><span className="eyebrow">Appearance</span><h2>{activeCategory}</h2><p>调整工作台的主题和字体。</p></div><div className="settings-groups"><ChoiceList title="浅色主题" items={themes.filter(item => item.group === 'light')} selected={theme} onSelect={onThemeChange} /><ChoiceList title="深色主题" items={themes.filter(item => item.group === 'dark')} selected={theme} onSelect={onThemeChange} /></div><ChoiceList title="编辑器字体" items={fonts} selected={font} onSelect={onFontChange} /></div></div>
      <footer className="settings-footer"><span>Changes are saved automatically</span><button className="primary-button" type="button" onClick={onClose}>Done</button></footer>
    </section>
  </div>;
}
