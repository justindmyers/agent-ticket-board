import { mdiShieldCheckOutline } from '@mdi/js';
import { Section } from '../../shared/components/Section';
import type { Flow } from '../../shared/types/host';
import type { Theme } from '../../shared/types/theme';
import { TicketRow } from './TicketRow';
import { TicketRows } from './TicketRows';

type Props = { f: Flow; title: string; theme: Theme };

export function ChecksSection({ f, title, theme }: Props) {
  if (!f.checks?.length) {
    return null;
  }

  return (
    <Section
      icon={mdiShieldCheckOutline}
      title={title}
      aside={`${f.checks.filter((c) => c.ok).length} of ${f.checks.length} pass`}
      accent={f.checks.some((c) => c.ok === false) ? 'red' : 'green'}
      theme={theme}
    >
      <TicketRows>
        {f.checks.map((c) => (
          <TicketRow
            key={c.name}
            state={c.ok === true ? 'done' : c.ok === false ? 'fail' : 'todo'}
            theme={theme}
            sub={
              c.note || c.ok === null ? (
                <span className="text-[11px] text-muted">{c.note ?? 'Waiting'}</span>
              ) : undefined
            }
          >
            {c.name}
          </TicketRow>
        ))}
      </TicketRows>
    </Section>
  );
}
