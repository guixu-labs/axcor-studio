interface NavigationRailProps {
  active: string;
  onSelect: (item: string) => void;
}

const items = [
  { id: 'workbench', label: 'Workbench', icon: '⌘' },
  { id: 'runs', label: 'Runs', icon: '▶' },
  { id: 'evidence', label: 'Evidence', icon: '◇' },
];

export function NavigationRail({ active, onSelect }: NavigationRailProps): JSX.Element {
  return <nav className="navigation-rail" aria-label="Primary navigation">
    <div className="rail-brand" aria-label="Agent Workbench">A</div>
    <div className="rail-items">
      {items.map(item => <button
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
      aria-label="Settings"
      aria-current={active === 'settings' ? 'page' : undefined}
      onClick={() => onSelect('settings')}
    >
      <span className="rail-icon" aria-hidden="true">⚙</span>
      <span className="rail-label">Settings</span>
    </button>
  </nav>;
}
