import type { Run, RunEvent } from '../../shared/protocol';

interface RunPanelProps { run?: Run; events: RunEvent[]; }

export function RunPanel({ run, events }: RunPanelProps): JSX.Element {
  return <aside><h2>Run Control</h2><p>Status: <strong>{run?.status ?? 'idle'}</strong></p>{events.map(event => <div className="event" key={event.id}><b>{event.type}</b><small>{new Date(event.timestamp).toLocaleTimeString()}</small></div>)}</aside>;
}
