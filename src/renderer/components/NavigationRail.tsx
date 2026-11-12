interface NavigationRailProps {
  active: string;
  onSelect: (item: string) => void;
  messages: { workbench: string; runs: string; settings: string; insight: string };
}

export function NavigationRail({ active, onSelect, messages }: NavigationRailProps): JSX.Element {
  const localizedItems = [
    {
      id: 'workbench',
      label: messages.workbench,
      icon: <span className="workspace-glyph">&#xeaf0;</span>,
    },
    { id: 'runs', label: messages.runs, icon: '▶' },
    {
      id: 'insight',
      label: messages.insight,
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="16" rx="3" />
        <path d="M6.5 12h2.75l2-4 2.5 8 2-4h1.75" />
      </svg>,
    },
  ];
  return <nav className="navigation-rail" aria-label={messages.workbench}>
    <div className="rail-items">
      {localizedItems.map(item => <button
        className={'rail-item' + (active === item.id ? ' active' : '')}
        key={item.id}
        type="button"
        aria-label={item.label}
        aria-current={active === item.id ? 'page' : undefined}
        onClick={() => onSelect(item.id)}
      >
        <span className="rail-icon" aria-hidden="true">{item.icon}</span>
        <span className="rail-label">{item.label}</span>
      </button>)}
    </div>
    <button
      className={'rail-item rail-settings' + (active === 'settings' ? ' active' : '')}
      type="button"
      aria-label={messages.settings}
      aria-current={active === 'settings' ? 'page' : undefined}
      onClick={() => onSelect('settings')}
    >
      <span className="rail-icon" aria-hidden="true">⚙</span>
      <span className="rail-label">Settings</span>
    </button>
  </nav>;
}
