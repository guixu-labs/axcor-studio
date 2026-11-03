interface NavigationRailProps {
  active: string;
  onSelect: (item: string) => void;
  messages: { workbench: string; runs: string; settings: string; insight: string };
}

export function NavigationRail({ active, onSelect, messages }: NavigationRailProps): JSX.Element {
  const localizedItems = [{ id: 'workbench', label: messages.workbench, icon: '⌘' }, { id: 'runs', label: messages.runs, icon: '▶' }, { id: 'insight', label: messages.insight, icon: '◉' }];
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
