import { mdiShieldCheckOutline } from '@mdi/js';
import { writesText } from '@agent-ticket-board/core/look';
import { Section } from '../../shared/components/Section';
import type { Write, WriteRun } from '../../shared/types/host';
import { Pill } from '../../shared/components/Pill';
import type { Theme } from '../../shared/types/theme';
import { TicketRow } from './TicketRow';
import { TicketRows } from './TicketRows';

type Props = { writes: Write[]; runs?: WriteRun[]; stage: 'planning' | 'testing'; theme: Theme };

/** The writes to the backend that Testing may make. Moving the ticket to Testing approves them. */
export function WritesSection({ writes, runs, stage, theme }: Props) {
  return (
    <Section
      icon={mdiShieldCheckOutline}
      title="Writes to the backend"
      caption={writesText(stage, writes.length)}
      aside={writes.length}
      accent="red"
      theme={theme}
    >
      {!!writes.length && (
        <TicketRows>
          {writes.map((w) => {
            const run = runs?.find((r) => r.method === w.method && r.path === w.path);
            return (
              <TicketRow
                key={`${w.method} ${w.path}`}
                lead={w.method}
                theme={theme}
                end={
                  stage === 'testing' && runs ? (
                    <Pill accent={run?.made ? 'green' : 'amber'} theme={theme}>
                      {run?.made ? 'Made' : 'Not made'}
                    </Pill>
                  ) : undefined
                }
              >
                <span className="font-mono text-[12px]">{w.path}</span>
                <span className="mt-0.5 block text-xs text-muted">{w.why}</span>
                {stage === 'testing' && runs && (
                  <span className="mt-0.5 block text-xs text-soft">
                    {run ? run.result : 'The agent did not report this write.'}
                  </span>
                )}
              </TicketRow>
            );
          })}
        </TicketRows>
      )}
    </Section>
  );
}
