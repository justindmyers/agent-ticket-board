import { mdiSwapHorizontal } from '@mdi/js';
import { Section } from '../../shared/components/Section';
import type { Detail } from '../../shared/types/host';
import type { Theme } from '../../shared/types/theme';
import { AfterMergeSelect } from './AfterMergeSelect';
import { AgentMoveCheckbox } from './AgentMoveCheckbox';
import { MoveHistory } from './MoveHistory';

type Props = { d: Detail; theme: Theme };

export function JiraStatusSection({ d, theme }: Props) {
  return (
    <Section
      icon={mdiSwapHorizontal}
      title="Jira status"
      caption="Changes only after you approve, or by the agent if you allow it here"
      accent="neutral"
      theme={theme}
    >
      <AgentMoveCheckbox ticketKey={d.ticket.key} allowed={!!d.jira?.agentMayMove} />
      {d.jira && <AfterMergeSelect ticketKey={d.ticket.key} jira={d.jira} />}
      {d.jira && <MoveHistory moves={d.jira.moves} />}
    </Section>
  );
}
