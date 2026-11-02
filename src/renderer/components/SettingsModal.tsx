import { fonts, themes } from '../settings';
import { useEffect, useRef, useState } from 'react';
import { localeOptions, type LocaleId, type Messages } from '../i18n';

export type ThemeId = string;
export type FontId = string;

interface SettingsModalProps {
  theme: ThemeId;
  font: FontId;
  onThemeChange: (theme: ThemeId) => void;
  onFontChange: (font: FontId) => void;
  locale: LocaleId;
  onLocaleChange: (locale: LocaleId) => void;
  messages: Messages;
  onClose: () => void;
}

function SelectField({ title, items, selected, onSelect }: { title: string; items: Array<{ id: string; label: string }>; selected: string; onSelect: (value: string) => void }): JSX.Element {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const selectedItem = items.find(item => item.id === selected) ?? items[0];
  useEffect(() => {
    const close = (event: MouseEvent): void => { if (container.current && !container.current.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  return <div className="settings-field" ref={container}><span>{title}</span><div className={'custom-select' + (open ? ' open' : '')}><button className="custom-select-trigger" type="button" aria-label={title} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(value => !value)}><span>{selectedItem?.label}</span><b aria-hidden="true">⌄</b></button>{open && <div className="custom-select-menu" role="listbox" aria-label={title}>{items.map(item => <button className={'custom-select-option' + (item.id === selected ? ' selected' : '')} role="option" aria-selected={item.id === selected} key={item.id} type="button" onClick={() => { onSelect(item.id); setOpen(false); }}><span>{item.label}</span>{item.id === selected && <b aria-hidden="true">✓</b>}</button>)}</div>}</div></div>;
}

const categories = ['appearance', 'general'] as const;

export function SettingsModal({ theme, font, locale, onThemeChange, onFontChange, onLocaleChange, onClose, messages }: SettingsModalProps): JSX.Element {
  const [activeCategory, setActiveCategory] = useState<typeof categories[number]>('appearance');
  return <div className="settings-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <header className="settings-header"><div className="settings-title"><span className="settings-title-icon">☷</span><h1 id="settings-title">{messages.settings}</h1></div><button className="modal-close" type="button" onClick={onClose} aria-label={messages.settings}>×</button></header>
      <div className="settings-layout"><nav className="settings-nav" aria-label={messages.settings}>{categories.map(category => <button className={'settings-nav-item' + (activeCategory === category ? ' active' : '')} key={category} type="button" onClick={() => setActiveCategory(category)}>{category === 'appearance' ? messages.appearance : messages.general}<span aria-hidden="true">›</span></button>)}</nav><div className="settings-content"><div className="settings-content-header"><h2>{activeCategory === 'appearance' ? messages.appearance : messages.general}</h2></div>{activeCategory === 'appearance' ? <div className="settings-fields"><SelectField title={messages.theme} items={themes.map(item => ({ id: item.id, label: `${item.group === 'light' ? messages.lightThemes : messages.darkThemes} · ${item.label}` }))} selected={theme} onSelect={onThemeChange} /><SelectField title={messages.editorFont} items={fonts} selected={font} onSelect={onFontChange} /></div> : <div className="settings-fields"><SelectField title={messages.language} items={localeOptions} selected={locale} onSelect={value => onLocaleChange(value as LocaleId)} /></div>}</div></div>
    </section>
  </div>;
}
