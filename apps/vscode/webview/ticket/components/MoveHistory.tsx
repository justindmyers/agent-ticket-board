import type { JiraInfo } from '../../shared/types/host';
import { ago } from '../../shared/utils/ago';

type Props = { moves: JiraInfo['moves'] };

export function MoveHistory({ moves }: Props) {
  if (!moves.length) {
    return null;
  }

  return (
    <ul className="m-0 mt-1 grid list-none gap-1 border-t border-ink/[0.06] p-0 pt-2 text-[11.5px] text-muted">
      {moves.map((m, i) => (
        <li key={i}>
          {m.ok ? '' : 'Failed: '}
          {m.from ? `${m.from} → ` : ''}
          {m.to} · {m.by === 'agent' ? 'by the agent' : 'by you'} · {ago(m.at)}
          {m.dryRun ? ' (dry run)' : ''}
        </li>
      ))}
    </ul>
  );
}
