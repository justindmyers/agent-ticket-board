import { mdiMagnify } from '@mdi/js';
import { Section } from '../../shared/components/Section';
import type { CodeReview } from '../../shared/types/host';
import type { Theme } from '../../shared/types/theme';
import { FindingRow } from './FindingRow';
import { TicketRow } from './TicketRow';
import { TicketRows } from './TicketRows';

type Props = { review: CodeReview; theme: Theme };

/** The review round: each finding with what became of it, then the repository checks. */
export function ReviewSection({ review, theme }: Props) {
  const open = review.findings.filter((x) => x.state === 'open' && x.severity === 'blocking');
  const failing = review.checks.filter((c) => !c.ok);

  return (
    <Section
      icon={mdiMagnify}
      title="Review"
      caption={review.summary}
      aside={`${review.findings.filter((x) => x.state === 'fixed').length} fixed`}
      accent={open.length || failing.length ? 'red' : 'green'}
      theme={theme}
    >
      <TicketRows>
        {review.findings.map((x) => (
          <FindingRow key={x.id} finding={x} theme={theme} />
        ))}
        {review.checks.map((c) => (
          <TicketRow
            key={c.name}
            state={c.ok ? 'done' : 'fail'}
            theme={theme}
            end={<span className="text-[11px] text-muted">{c.note ?? ''}</span>}
          >
            {c.name}
          </TicketRow>
        ))}
      </TicketRows>
    </Section>
  );
}
