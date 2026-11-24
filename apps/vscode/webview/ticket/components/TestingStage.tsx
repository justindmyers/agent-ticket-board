import { mdiFormatListChecks, mdiRobotOutline } from '@mdi/js';
import { runActive } from '@agent-ticket-board/core/look';
import { Section } from '../../shared/components/Section';
import type { Flow } from '../../shared/types/host';
import type { Theme } from '../../shared/types/theme';
import type { Act } from '../types/ticket';
import { EvidenceRow } from './EvidenceRow';
import { RunSection } from './RunSection';
import { TicketRows } from './TicketRows';

type Props = { f: Flow; act: Act; theme: Theme };

export function TestingStage({ f, act, theme }: Props) {
  const reqs = f.requirements ?? [];
  const passing = reqs.filter((r) => f.evidence?.[r.id]?.ok).length;

  return (
    <>
      {f.run?.stage === 'testing' && runActive(f) && (
        <RunSection run={f.run} act={act} theme={theme} />
      )}

      <Section
        icon={mdiFormatListChecks}
        title="Evidence"
        caption="The agent checked each requirement in the live app or with its test, and viewed every screenshot."
        aside={`${passing} of ${reqs.length}`}
        accent="amber"
        theme={theme}
      >
        <TicketRows>
          {reqs.map((r) => (
            <EvidenceRow key={r.id} req={r} ev={f.evidence?.[r.id]} act={act} theme={theme} />
          ))}
        </TicketRows>
      </Section>

      {f.review && f.evidence && (
        <Section
          icon={mdiRobotOutline}
          title="Agent summary"
          caption={f.review}
          accent="violet"
          theme={theme}
        >
          <span />
        </Section>
      )}
    </>
  );
}
