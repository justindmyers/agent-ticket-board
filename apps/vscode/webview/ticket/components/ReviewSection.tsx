import { mdiMagnify } from '@mdi/js';
import { Section } from '../../shared/components/Section';
import type { CodeReview } from '../../shared/types/host';
import type { Theme } from '../../shared/types/theme';
import type { Act } from '../types/ticket';
import { FindingRow } from './FindingRow';
import { TicketRows } from './TicketRows';

type Props = { review: CodeReview; act: Act; theme: Theme };

/** The review round: each finding with what became of it. The board's own checks are in the Gate section. */
export function ReviewSection({ review, act, theme }: Props) {
  const open = review.findings.filter(
    (x) => x.state === 'open' && x.severity === 'blocking' && x.decision !== 'dismiss'
  );

  return (
    <Section
      icon={mdiMagnify}
      title="Review"
      caption={review.summary}
      aside={`${review.findings.filter((x) => x.state === 'fixed').length} fixed`}
      accent={open.length ? 'red' : 'green'}
      theme={theme}
    >
      <TicketRows>
        {review.findings.map((x) => (
          <FindingRow key={x.id} finding={x} act={act} theme={theme} />
        ))}
      </TicketRows>
    </Section>
  );
}
