import { Button } from '../../shared/components/Button';
import { Pill } from '../../shared/components/Pill';
import type { Finding } from '../../shared/types/host';
import type { Accent, Theme } from '../../shared/types/theme';
import type { Act } from '../types/ticket';
import { TicketRow } from './TicketRow';

type Props = { finding: Finding; act: Act; theme: Theme };

const STATE: Record<Finding['state'], { label: string; accent: Accent }> = {
  fixed: { label: 'Fixed', accent: 'green' },
  open: { label: 'Not fixed', accent: 'red' },
  dropped: { label: 'Dropped', accent: 'neutral' }
};

const NOTE_LABEL: Record<Finding['state'], string> = {
  fixed: 'Note',
  open: 'Not fixed because',
  dropped: 'Dropped because'
};

/** One finding of the review: where, what is wrong, the fix, and what became of it. */
export function FindingRow({ finding: x, act, theme }: Props) {
  const s =
    x.decision === 'fix' ? { label: 'Will fix', accent: 'amber' as Accent } : STATE[x.state];
  const label = x.decision === 'dismiss' ? { label: 'Dismissed', accent: 'neutral' as Accent } : s;
  const where = x.line ? `${x.file}:${x.line}` : x.file;
  const choose = (choice: string) => () => act(`finding:${x.id}:${choice}`);

  return (
    <TicketRow
      state={x.state === 'fixed' ? 'done' : x.state === 'open' ? 'fail' : 'todo'}
      lead={x.id}
      theme={theme}
      end={
        <Pill accent={label.accent} theme={theme}>
          {label.label}
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
      {x.note && (
        <span className="mt-1 block text-xs text-muted">
          {NOTE_LABEL[x.state]}: {x.note}
        </span>
      )}
      {x.state !== 'fixed' && (
        <span className="mt-2 flex flex-wrap gap-2">
          {x.decision ? (
            <Button variant="ghost" className="h-7 px-2" onPress={choose('clear')}>
              Undo
            </Button>
          ) : (
            <>
              <Button variant="default" className="h-7 px-2" onPress={choose('fix')}>
                {x.state === 'dropped' ? 'Fix anyway' : 'Fix'}
              </Button>
              {x.state === 'open' && (
                <Button variant="ghost" className="h-7 px-2" onPress={choose('dismiss')}>
                  Dismiss
                </Button>
              )}
            </>
          )}
        </span>
      )}
    </TicketRow>
  );
}
