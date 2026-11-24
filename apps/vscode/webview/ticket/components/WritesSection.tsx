import { mdiShieldCheckOutline } from '@mdi/js';
import { writesText } from '@agent-ticket-board/core/look';
import { Section } from '../../shared/components/Section';
import type { Write } from '../../shared/types/host';
import type { Theme } from '../../shared/types/theme';
import { TicketRow } from './TicketRow';
import { TicketRows } from './TicketRows';

type Props = { writes: Write[]; stage: 'planning' | 'testing'; theme: Theme };

/** The writes to the backend that Testing may make. Moving the ticket to Testing approves them. */
export function WritesSection({ writes, stage, theme }: Props) {
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
          {writes.map((w) => (
            <TicketRow key={`${w.method} ${w.path}`} lead={w.method} theme={theme}>
              <span className="font-mono text-[12px]">{w.path}</span>
              <span className="mt-0.5 block text-xs text-muted">{w.why}</span>
            </TicketRow>
          ))}
        </TicketRows>
      )}
    </Section>
  );
}
