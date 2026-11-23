import { mdiFileDocumentOutline } from '@mdi/js';
import { useState } from 'react';
import { LinkButton } from '../../shared/components/LinkButton';
import { Section } from '../../shared/components/Section';
import type { AdfSection } from '../../shared/types/adf';
import type { Theme } from '../../shared/types/theme';
import { cx } from '../../shared/utils/cx';

type Props = { context: AdfSection[]; theme: Theme };

const LONG = 900;

export function TicketDescription({ context, theme }: Props) {
  const [full, setFull] = useState(false);
  const long = context.reduce((n, s) => n + s.html.length, 0) > LONG;

  return (
    <Section
      icon={mdiFileDocumentOutline}
      title="Ticket"
      caption="From Jira"
      accent="neutral"
      theme={theme}
    >
      <div
        className={cx(
          'prose-ticket relative',
          long &&
            !full &&
            'max-h-56 overflow-hidden [mask-image:linear-gradient(to_bottom,black_70%,transparent)]'
        )}
      >
        {context.map((s, i) => (
          <div key={i}>
            {s.title && <p className="mt-3 mb-1 font-semibold text-ink/90">{s.title}</p>}
            <div dangerouslySetInnerHTML={{ __html: s.html }} />
          </div>
        ))}
      </div>
      {long && (
        <LinkButton
          className="mt-2 w-fit rounded text-[12px] font-medium text-soft underline-offset-4 hover:text-ink hover:underline"
          onPress={() => setFull(!full)}
          aria-expanded={full}
        >
          {full ? 'Show less' : 'Show full description'}
        </LinkButton>
      )}
    </Section>
  );
}
