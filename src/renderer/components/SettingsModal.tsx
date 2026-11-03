import { defaultFont, defaultTheme, fonts, themes } from '../settings';
import { Fragment, useEffect, useRef, useState } from 'react';
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

interface SelectFieldProps {
  title: string;
  description: string;
  icon: string;
  items: Array<{ id: string; label: string; group?: string }>;
  groupLabels?: Record<string, string>;
  selected: string;
  defaultId: string;
  defaultBadge: string;
  onSelect: (value: string) => void;
}

function SelectField({ title, description, icon, items, groupLabels, selected, defaultId, defaultBadge, onSelect }: SelectFieldProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const selectedItem = items.find(item => item.id === selected) ?? items[0];
  useEffect(() => {
    const close = (event: MouseEvent): void => { if (container.current && !container.current.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  return <div className="settings-field" ref={container}>
    <span className="settings-field-icon" aria-hidden="true">{icon}</span>
    <div className="settings-field-main">
      <div className="settings-field-title">{title}</div>
      <p className="settings-field-description">{description}</p>
      <div className="settings-field-control">
        <div className={'custom-select' + (open ? ' open' : '')}>
          <button className="custom-select-trigger" type="button" aria-label={title} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(value => !value)}>
            <span>{selectedItem?.label}</span>
            <b aria-hidden="true">⌄</b>
          </button>
          {open && <div className="custom-select-menu" role="listbox" aria-label={title}>
            {items.map((item, index) => <Fragment key={item.id}>
              {item.group && item.group !== items[index - 1]?.group && <div className="custom-select-group" role="presentation">{groupLabels?.[item.group] ?? item.group}</div>}
              <button
                className={'custom-select-option' + (item.id === selected ? ' selected' : '')}
                role="option"
                aria-selected={item.id === selected}
                type="button"
                onClick={() => { onSelect(item.id); setOpen(false); }}
              >
                <span>{item.label}</span>
                <span className="custom-select-tags">
                  {item.id === defaultId && <em aria-hidden="true">{defaultBadge}</em>}
                  {item.id === selected && <b aria-hidden="true">✓</b>}
                </span>
              </button>
            </Fragment>)}
          </div>}
        </div>
      </div>
    </div>
  </div>;
}

const categories = ['appearance', 'general'] as const;

export function SettingsModal({ theme, font, locale, onThemeChange, onFontChange, onLocaleChange, onClose, messages }: SettingsModalProps): JSX.Element {
  const [activeCategory, setActiveCategory] = useState<typeof categories[number]>('appearance');
  const categoryLabel = activeCategory === 'appearance' ? messages.appearance : messages.general;
  return <div className="settings-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <header className="settings-header">
        <div className="settings-title">
          <span className="settings-title-glyph" aria-hidden="true">⚙</span>
          <h1 id="settings-title">{messages.settings}</h1>
        </div>
        <button className="modal-close" type="button" onClick={onClose} aria-label={messages.settings}>×</button>
      </header>
      <div className="settings-body">
        <nav className="settings-nav" aria-label={messages.settings}>
          {categories.map(category => <button
            className={'settings-nav-item' + (activeCategory === category ? ' active' : '')}
            key={category}
            type="button"
            aria-current={activeCategory === category ? 'page' : undefined}
            onClick={() => setActiveCategory(category)}
          >
            {category === 'appearance' ? messages.appearance : messages.general}
          </button>)}
        </nav>
        <div className="settings-content">
          <div className="settings-content-header"><h2>{categoryLabel}</h2></div>
          {activeCategory === 'appearance'
            ? <div className="settings-fields">
              <SelectField
                title={messages.theme}
                description={messages.themeDescription}
                icon="◐"
                items={themes.map(item => ({ id: item.id, label: item.label, group: item.group }))}
                groupLabels={{ light: messages.lightThemes, dark: messages.darkThemes }}
                selected={theme}
                defaultId={defaultTheme.id}
                defaultBadge={messages.defaultBadge}
                onSelect={onThemeChange}
              />
              <SelectField
                title={messages.editorFont}
                description={messages.editorFontDescription}
                icon="Aa"
                items={fonts}
                selected={font}
                defaultId={defaultFont.id}
                defaultBadge={messages.defaultBadge}
                onSelect={onFontChange}
              />
            </div>
            : <div className="settings-fields">
              <SelectField
                title={messages.language}
                description={messages.languageDescription}
                icon="文"
                items={localeOptions}
                selected={locale}
                defaultId="zh-CN"
                defaultBadge={messages.defaultBadge}
                onSelect={value => onLocaleChange(value as LocaleId)}
              />
            </div>}
        </div>
      </div>
    </section>
  </div>;
}
