import { mdiLightbulbOutline } from '@mdi/js';
import { Section } from '../../shared/components/Section';
import type { Theme } from '../../shared/types/theme';
import { TicketRow } from './TicketRow';
import { TicketRows } from './TicketRows';

type Props = { assumptions: string[]; theme: Theme };

/** What the agent decided where the ticket is not clear, so the developer can check it before approving. */
export function AssumptionsSection({ assumptions, theme }: Props) {
  return (
    <Section
      icon={mdiLightbulbOutline}
      title="Assumptions"
      caption="The agent decided these. To change one, add a comment and re-plan."
      aside={assumptions.length}
      accent="amber"
      theme={theme}
    >
      <TicketRows>
        {assumptions.map((a, i) => (
          <TicketRow key={`${i}-${a}`} lead={String(i + 1)} theme={theme}>
            {a}
          </TicketRow>
        ))}
      </TicketRows>
    </Section>
  );
}
