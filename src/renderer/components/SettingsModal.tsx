import { defaultFont, defaultTheme, fonts, themes } from '../settings';
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { localeOptions, type LocaleId, type Messages } from '../i18n';
import { loadWorkbenchState, saveWorkbenchState } from '../workbench/storage';
import type { ProviderKey } from '../../shared/opsbotApi';

export type ThemeId = string;
export type FontId = string;

interface SettingsModalProps {
  theme: ThemeId;
  font: FontId;
  onThemeChange: (theme: ThemeId) => void;
  onFontChange: (font: FontId) => void;
  locale: LocaleId;
  onLocaleChange: (locale: LocaleId) => void;
  opsbotUrl: string;
  onOpsbotUrlChange: (url: string) => void;
  backgroundImage: string;
  backgroundFit: 'cover' | 'contain';
  onBackgroundImageChange: (dataUrl: string) => void;
  onBackgroundFitChange: (fit: 'cover' | 'contain') => void;
  messages: Messages;
  onClose: () => void;
}

const MAX_BACKGROUND_IMAGE_BYTES = 3 * 1024 * 1024;

interface BackgroundImageFieldProps {
  title: string;
  description: string;
  icon: string;
  hasImage: boolean;
  chooseLabel: string;
  removeLabel: string;
  onChange: (dataUrl: string) => void;
}

function BackgroundImageField({ title, description, icon, hasImage, chooseLabel, removeLabel, onChange }: BackgroundImageFieldProps): JSX.Element {
  const input = useRef<HTMLInputElement>(null);
  return <div className="settings-field">
    <span className="settings-field-icon" aria-hidden="true">{icon}</span>
    <div className="settings-field-main">
      <div className="settings-field-title">{title}</div>
      <p className="settings-field-description">{description}</p>
      <div className="settings-field-control">
        <input
          ref={input}
          className="settings-file-input"
          type="file"
          accept="image/*"
          aria-label={title}
          onChange={event => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (!file || file.size > MAX_BACKGROUND_IMAGE_BYTES) return;
            const reader = new FileReader();
            reader.onload = () => { if (typeof reader.result === 'string') onChange(reader.result); };
            reader.readAsDataURL(file);
          }}
        />
        <button className="settings-image-button" type="button" onClick={() => input.current?.click()}>{chooseLabel}</button>
        {hasImage && <button className="settings-image-button" type="button" onClick={() => onChange('')}>{removeLabel}</button>}
      </div>
    </div>
  </div>;
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

interface InputFieldProps {
  title: string;
  description: string;
  icon: string;
  value: string;
  ariaLabel: string;
  onChange: (value: string) => void;
}

function InputField({ title, description, icon, value, ariaLabel, onChange }: InputFieldProps): JSX.Element {
  return <div className="settings-field">
    <span className="settings-field-icon" aria-hidden="true">{icon}</span>
    <div className="settings-field-main">
      <div className="settings-field-title">{title}</div>
      <p className="settings-field-description">{description}</p>
      <div className="settings-field-control">
        <input className="settings-input" type="text" value={value} aria-label={ariaLabel} spellCheck={false} onChange={event => onChange(event.target.value)} />
      </div>
    </div>
  </div>;
}

const PROVIDER_RUNTIME_OPTIONS = [
  { id: 'claude_sdk', label: 'Claude SDK' },
  { id: 'claude_cli', label: 'Claude CLI' },
  { id: 'opencode', label: 'OpenCode' },
  { id: 'codex_cli', label: 'Codex CLI' },
];

function validationChip(validation: ProviderKey['worker_validation'], messages: Messages): JSX.Element {
  if (!validation) return <span className="provider-chip provider-chip-untested">{messages.providerUntested}</span>;
  // Opsbot reports validation either as a success boolean (test responses)
  // or as a status string (persisted provider state).
  if (typeof validation.success === 'boolean') {
    return validation.success
      ? <span className="provider-chip provider-chip-ok">{messages.providerValidated}</span>
      : <span className="provider-chip provider-chip-fail">{messages.providerFailed}</span>;
  }
  if (typeof validation.status === 'string' && validation.status !== '') {
    return validation.status === 'valid'
      ? <span className="provider-chip provider-chip-ok">{messages.providerValidated}</span>
      : <span className="provider-chip provider-chip-fail" title={validation.error}>{messages.providerFailed}</span>;
  }
  return <span className="provider-chip provider-chip-untested">{messages.providerUntested}</span>;
}

function providerRuntimeLabel(runtime?: string): string {
  return PROVIDER_RUNTIME_OPTIONS.find(item => item.id === runtime)?.label ?? runtime ?? '';
}

function ProviderSection({ icon, title, children }: { icon: string; title: string; children: ReactNode }): JSX.Element {
  return <section className="settings-field">
    <span className="settings-field-icon" aria-hidden="true">{icon}</span>
    <div className="settings-field-main">
      <h3 className="settings-field-title">{title}</h3>
      <div className="settings-field-control">{children}</div>
    </div>
  </section>;
}

const providerNamesStorageKey = 'workbench.providerNames';

async function providerIdentity(opsbotUrl: string, provider: ProviderKey): Promise<string> {
  const config = [opsbotUrl.trim().replace(/\/+$/, ''), provider.key, provider.runtime, provider.model, provider.base_url];
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(config)));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function ProvidersPanel({ messages, opsbotUrl }: { messages: Messages; opsbotUrl: string }): JSX.Element {
  const [providers, setProviders] = useState<Array<ProviderKey & { identity: string }> | null>(null);
  const [providerNames, setProviderNames] = useState(() => loadWorkbenchState<Record<string, string>>(providerNamesStorageKey, {}));
  const [nameDraft, setNameDraft] = useState('');
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [activeIndex, setActiveIndex] = useState<number>();
  const [key, setKey] = useState('');
  const [model, setModel] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [runtime, setRuntime] = useState('claude_sdk');
  const [busy, setBusy] = useState(false);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);

  const refresh = async (): Promise<void> => {
    try {
      const rows = await window.opsbot.listProviders();
      setProviders(await Promise.all(rows.map(async provider => ({ ...provider, identity: await providerIdentity(opsbotUrl, provider) }))));
      setError(undefined);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : String(refreshError));
    }
  };
  useEffect(() => { void refresh(); }, []);

  const saveProviderName = (identity: string): void => {
    const names = { ...providerNames };
    const name = nameDraft.trim();
    if (name) names[identity] = name;
    else delete names[identity];
    setNameDraft(name);
    setProviderNames(names);
    saveWorkbenchState(providerNamesStorageKey, names);
  };

  const run = async (action: () => Promise<void>): Promise<void> => {
    setBusy(true);
    setNotice(undefined);
    try {
      await action();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : String(actionError));
    } finally {
      setBusy(false);
    }
  };

  const testCandidate = async (): Promise<void> => {
    setNotice(undefined);
    setError(undefined);
    try {
      const result = await window.opsbot.testProviderKey(key.trim(), model.trim(), baseUrl.trim(), runtime);
      setNotice(result.success === false || result.error ? `${messages.providerTestFailed}：${result.error ?? 'unknown'}` : messages.providerTestPassed);
    } catch (testError) {
      setError(testError instanceof Error ? testError.message : String(testError));
    }
  };

  const addProvider = async (): Promise<void> => {
    if (!key.trim()) { setError(messages.providerKey + ' 不能为空'); return; }
    await run(async () => {
      const rows = (providers ?? []).map(provider => ({
        key: provider.key,
        ...(provider.model ? { model: provider.model } : {}),
        ...(provider.base_url ? { base_url: provider.base_url } : {}),
        ...(provider.runtime ? { runtime: provider.runtime } : {}),
      }));
      rows.push({ key: key.trim(), ...(model.trim() ? { model: model.trim() } : {}), ...(baseUrl.trim() ? { base_url: baseUrl.trim() } : {}), runtime });
      const saved = await window.opsbot.saveProviders(rows);
      if (!saved.ok) { setError(saved.error ?? '保存失败'); return; }
      setKey(''); setModel(''); setBaseUrl('');
      setNotice(messages.providerSaved);
      await refresh();
    });
  };

  return <div className="settings-fields">
    {error && <p className="run-list-error" role="alert">{error}</p>}
    {notice && <p className="providers-notice" role="status">{notice}</p>}
    <ProviderSection icon="＋" title={messages.addProvider}>
      <div className="providers-form">
        <div className="providers-form-grid">
          <label className="run-config-field">
            <span className="run-config-title">{messages.providerRuntime}</span>
            <select className="run-config-select" value={runtime} aria-label={messages.providerRuntime} onChange={event => setRuntime(event.target.value)}>
              {PROVIDER_RUNTIME_OPTIONS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
          <label className="run-config-field">
            <span className="run-config-title">{messages.providerBaseUrl}</span>
            <input className="run-config-input" type="text" value={baseUrl} aria-label={messages.providerBaseUrl} onChange={event => setBaseUrl(event.target.value)} />
          </label>
          <label className="run-config-field">
            <span className="run-config-title">{messages.providerModel}</span>
            <input className="run-config-input" type="text" value={model} aria-label={messages.providerModel} onChange={event => setModel(event.target.value)} />
          </label>
          <label className="run-config-field">
            <span className="run-config-title">{messages.providerKey}</span>
            <input className="run-config-input" type="password" value={key} aria-label={messages.providerKey} onChange={event => setKey(event.target.value)} />
          </label>
        </div>
        <div className="providers-form-actions">
          <button className="settings-image-button" type="button" disabled={busy} onClick={() => void testCandidate()}>{messages.testKey}</button>
          <button className="settings-image-button" type="button" disabled={busy} onClick={() => void addProvider()}>{messages.add}</button>
        </div>
      </div>
    </ProviderSection>
    <ProviderSection icon="☷" title={messages.providersExisting}>
      <div className="provider-list">
        {providers === null && !error && <p className="providers-empty">{messages.providersDescription}</p>}
        {providers?.length === 0 && !error && <p className="providers-empty">{messages.providerUntested} — {messages.providersDescription}</p>}
        {providers?.map(provider => {
          const cardId = `${provider.provider_index}:${provider.identity}`;
          const isExpanded = cardId === expandedCard;
          const customName = providerNames[provider.identity] ?? '';
          const defaultName = [providerRuntimeLabel(provider.runtime), provider.model].filter(Boolean).join(' · ') || messages.defaultBadge;
          return <div className={'provider-row provider-card' + (provider.provider_index === activeIndex ? ' provider-row-active' : '')} key={cardId}>
            <button className="provider-card-head" type="button" aria-expanded={isExpanded} onClick={() => {
              setNameDraft(customName);
              setExpandedCard(isExpanded ? null : cardId);
            }}>
              <span className="provider-name">{customName || defaultName}</span>
              {validationChip(provider.worker_validation, messages)}
              {provider.provider_index === activeIndex && <span className="provider-chip provider-chip-active">{messages.providerActive}</span>}
              <span className="provider-chevron" aria-hidden="true">{isExpanded ? '▾' : '▸'}</span>
            </button>
            {isExpanded && <div className="provider-card-detail">
              <form className="provider-name-form" onSubmit={event => { event.preventDefault(); saveProviderName(provider.identity); }}>
                <label className="run-config-field">
                  <span className="run-config-title">{messages.providerName}</span>
                  <input className="run-config-input" value={nameDraft} placeholder={defaultName} onChange={event => setNameDraft(event.target.value)} />
                </label>
                <button className="settings-image-button" type="submit" disabled={nameDraft.trim() === customName}>{messages.save}</button>
              </form>
              <div className="provider-meta">
                <span>{messages.providerBaseUrl}：{provider.base_url || messages.defaultBadge}</span>
                <span>{messages.providerKey}：{provider.masked}</span>
              </div>
              <div className="provider-actions">
                <button className="settings-image-button" type="button" disabled={busy} onClick={() => void run(async () => {
                  const result = await window.opsbot.testProvider(provider.provider_index);
                  if (result.success === false || result.error) {
                    setError(`${messages.providerTestFailed}：${result.error ?? 'unknown'}`);
                  } else {
                    setNotice(messages.providerTestPassed);
                    await refresh();
                  }
                })}>{messages.testKey}</button>
                <button className="settings-image-button" type="button" disabled={busy} onClick={() => void run(async () => {
                  const result = await window.opsbot.activateProvider(provider.provider_index);
                  if (!result.ok) { setError('激活失败'); return; }
                  setError(undefined);
                  setActiveIndex(result.activeIndex ?? provider.provider_index);
                })}>{messages.providerActive}</button>
                <button className="settings-image-button provider-delete" type="button" disabled={busy} onClick={() => void run(async () => { await window.opsbot.deleteProvider(provider.provider_index); setExpandedCard(null); setNotice(messages.providerDeleted); await refresh(); })}>×</button>
              </div>
            </div>}
          </div>;
        })}
      </div>
    </ProviderSection>
  </div>;
}

const categories = ['general', 'appearance', 'providers'] as const;

export function SettingsModal({ theme, font, locale, onThemeChange, onFontChange, onLocaleChange, opsbotUrl, onOpsbotUrlChange, backgroundImage, backgroundFit, onBackgroundImageChange, onBackgroundFitChange, onClose, messages }: SettingsModalProps): JSX.Element {
  const [activeCategory, setActiveCategory] = useState<typeof categories[number]>('appearance');
  const categoryLabels: Record<typeof categories[number], string> = { appearance: messages.appearance, general: messages.general, providers: messages.providers };
  const categoryLabel = categoryLabels[activeCategory];
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
            {categoryLabels[category]}
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
              <BackgroundImageField
                title={messages.backgroundImage}
                description={messages.backgroundImageDescription}
                icon="▧"
                hasImage={backgroundImage !== ''}
                chooseLabel={messages.chooseImage}
                removeLabel={messages.removeImage}
                onChange={onBackgroundImageChange}
              />
              <SelectField
                title={messages.backgroundFit}
                description={messages.backgroundFitDescription}
                icon="⇱"
                items={[{ id: 'cover', label: messages.fitCover }, { id: 'contain', label: messages.fitContain }]}
                selected={backgroundFit}
                defaultId="cover"
                defaultBadge={messages.defaultBadge}
                onSelect={value => onBackgroundFitChange(value as 'cover' | 'contain')}
              />
            </div>
            : activeCategory === 'general'
              ? <div className="settings-fields">
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
                <InputField
                  title={messages.opsbotUrl}
                  description={messages.opsbotUrlDescription}
                  icon="⇄"
                  value={opsbotUrl}
                  ariaLabel={messages.opsbotUrl}
                  onChange={onOpsbotUrlChange}
                />
              </div>
              : <ProvidersPanel messages={messages} opsbotUrl={opsbotUrl} />}
        </div>
      </div>
    </section>
  </div>;
}
