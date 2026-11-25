import { Pill } from '../../shared/components/Pill';
import type { Finding } from '../../shared/types/host';
import type { Accent, Theme } from '../../shared/types/theme';
import { TicketRow } from './TicketRow';

type Props = { finding: Finding; theme: Theme };

const STATE: Record<Finding['state'], { label: string; accent: Accent }> = {
  fixed: { label: 'Fixed', accent: 'green' },
  open: { label: 'Not fixed', accent: 'red' },
  dropped: { label: 'Dropped', accent: 'neutral' }
};

/** One finding of the review: where, what is wrong, the fix, and what became of it. */
export function FindingRow({ finding: x, theme }: Props) {
  const s = STATE[x.state];
  const where = x.line ? `${x.file}:${x.line}` : x.file;

  return (
    <TicketRow
      state={x.state === 'fixed' ? 'done' : x.state === 'open' ? 'fail' : 'todo'}
      lead={x.id}
      theme={theme}
      end={
        <Pill accent={s.accent} theme={theme}>
          {s.label}
        </Pill>
      }
      sub={
        <span className="font-mono text-[11.5px]">
          {where} · {x.reviewer}
          {x.severity === 'style' ? ' · style' : ''}
        </span>
      }
    >
      {x.problem}
      <span className="mt-1 block text-xs text-soft">Fix: {x.fix}</span>
      {x.note && <span className="mt-1 block text-xs text-muted">{x.note}</span>}
    </TicketRow>
  );
}
