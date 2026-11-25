import { mdiSourceCommit } from '@mdi/js';
import { Section } from '../../shared/components/Section';
import type { Commits } from '../../shared/types/host';
import type { Theme } from '../../shared/types/theme';
import { TicketRow } from './TicketRow';
import { TicketRows } from './TicketRows';

type Props = { commits: Commits; theme: Theme };

/** The commits of the change: the ones made, then the ones planned, each with its files. */
export function CommitsSection({ commits, theme }: Props) {
  const total = commits.done.length + commits.plan.length;
  if (!total) {
    return null;
  }

  return (
    <Section
      icon={mdiSourceCommit}
      title="Commits"
      caption={commits.plan.length ? commits.summary : 'Every planned commit is made.'}
      aside={`${commits.done.length} of ${total} made`}
      accent={commits.plan.length ? 'amber' : 'green'}
      theme={theme}
    >
      <TicketRows>
        {commits.done.map((c) => (
          <TicketRow
            key={c.sha}
            state="done"
            theme={theme}
            end={<span className="font-mono text-[11px] text-muted">{c.sha}</span>}
          >
            <span className="font-mono text-[12px]">{c.title}</span>
          </TicketRow>
        ))}
        {commits.plan.map((c) => (
          <TicketRow
            key={c.title}
            state="todo"
            theme={theme}
            sub={<span className="font-mono text-[11.5px]">{c.files.join(', ')}</span>}
          >
            <span className="font-mono text-[12px]">{c.title}</span>
          </TicketRow>
        ))}
      </TicketRows>
    </Section>
  );
}
