import type { Run } from '../../shared/protocol';

export function EvidencePanel({ run }: { run?: Run }): JSX.Element {
  return (
    <footer>
      <h2>Evidence</h2>
      <p>{run ? `Run ${run.id} · Mock artifact available after completion.` : 'Run evidence will appear here.'}</p>
    </footer>
  );
}
