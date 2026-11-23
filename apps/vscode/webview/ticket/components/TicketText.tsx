import { mdiFileDocumentOutline, mdiFormatListChecks, mdiRobotOutline } from '@mdi/js';
import { Section } from '../../shared/components/Section';
import type { Detail } from '../../shared/types/host';
import type { Theme } from '../../shared/types/theme';
import { sections } from '../../shared/utils/adf';
import { TicketDescription } from './TicketDescription';

type Props = { d: Detail; theme: Theme };

// Jira ADF goes through adfHtml(), which escapes every text value.
export function TicketText({ d, theme }: Props) {
  const desc = d.ticket.description;
  if (desc === undefined) {
    return (
      <Section icon={mdiFileDocumentOutline} title="Ticket" accent="neutral" theme={theme}>
        <div
          className="h-16 animate-breathe rounded-lg bg-ink/[0.06] motion-reduce:animate-none"
          aria-label="Loading description"
        />
      </Section>
    );
  }
  if (desc === null) {
    return (
      <Section
        icon={mdiFileDocumentOutline}
        title="Ticket"
        caption="No description in Jira"
        accent="neutral"
        theme={theme}
      >
        <span />
      </Section>
    );
  }
  const secs = sections(desc);
  const context = secs.filter((s) => s.kind === 'context' || s.kind === 'other');

  return (
    <>
      {context.length > 0 && <TicketDescription context={context} theme={theme} />}
      {secs
        .filter((s) => s.kind === 'acceptance')
        .map((s, i) => (
          <Section
            key={'a' + i}
            icon={mdiFormatListChecks}
            title="Acceptance criteria"
            caption="From Jira"
            accent="green"
            theme={theme}
          >
            <div className="prose-ticket" dangerouslySetInnerHTML={{ __html: s.html }} />
          </Section>
        ))}
      {secs
        .filter((s) => s.kind === 'notes')
        .map((s, i) => (
          <Section
            key={'n' + i}
            icon={mdiRobotOutline}
            title={s.title ?? 'Notes'}
            caption="A note in the Jira ticket"
            accent="violet"
            theme={theme}
          >
            <div className="prose-ticket" dangerouslySetInnerHTML={{ __html: s.html }} />
          </Section>
        ))}
    </>
  );
}
