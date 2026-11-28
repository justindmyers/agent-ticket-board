import { mdiSourceMerge } from '@mdi/js';
import { Section } from '../../shared/components/Section';
import type { Gate } from '../../shared/types/host';
import type { Theme } from '../../shared/types/theme';
import { stepView } from '@agent-ticket-board/core/look';
import { TicketRow } from './TicketRow';
import { TicketRows } from './TicketRows';

type Props = { gate: Gate; theme: Theme };

/** The checks before a push, in the order that they ran. The first failure ends the list. */
export function GateSection({ gate, theme }: Props) {
  return (
    <Section
      icon={mdiSourceMerge}
      title="Checks before a push"
      caption={
        gate.ok
          ? `Every check passes${gate.merged ? ' after the merge of the base branch' : ''}.`
          : 'A check failed. The checks after it did not run.'
      }
      aside={`${gate.steps.filter((s) => s.ok).length} of ${gate.steps.length}`}
      accent={gate.ok ? 'green' : 'red'}
      theme={theme}
    >
      <TicketRows>
        {gate.steps.map((s) => {
          const v = stepView(s);
          return (
            <TicketRow
              key={s.name}
              state={s.ok ? 'done' : 'fail'}
              theme={theme}
              sub={
                v.command || s.note ? (
                  <span className="flex min-w-0 flex-col gap-1">
                    {v.command && (
                      <code className="font-mono text-[11px] [overflow-wrap:anywhere] text-muted">
                        {v.command}
                      </code>
                    )}
                    {s.note && (
                      <span className="font-mono text-[11.5px] whitespace-pre-wrap">{s.note}</span>
                    )}
                  </span>
                ) : undefined
              }
            >
              {v.label}
            </TicketRow>
          );
        })}
      </TicketRows>
    </Section>
  );
}
