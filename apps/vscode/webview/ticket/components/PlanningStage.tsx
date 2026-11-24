import {
  mdiChartBar,
  mdiFormatListChecks,
  mdiHelpCircleOutline,
  mdiInformationOutline
} from '@mdi/js';
import { Button } from '../../shared/components/Button';
import { Dot } from '../../shared/components/Dot';
import { Section } from '../../shared/components/Section';
import type { Detail } from '../../shared/types/host';
import type { Theme } from '../../shared/types/theme';
import { PALETTE } from '@agent-ticket-board/core/look';
import { ink } from '../../shared/utils/surfaces';
import type { Act } from '../types/ticket';
import { canStartPlanning } from '../utils/ticket';
import { TicketRow } from './TicketRow';
import { TicketRows } from './TicketRows';
import { TicketText } from './TicketText';

type Props = { d: Detail; act: Act; theme: Theme };

export function PlanningStage({ d, act, theme }: Props) {
  const f = d.flow;

  return (
    <>
      {canStartPlanning(d) && (
        <Section
          icon={mdiInformationOutline}
          title="Not started"
          caption="Planning reads the ticket, asks only the questions that change the build, then writes requirements and steps for you to approve."
          accent="blue"
          theme={theme}
        >
          <div className="pt-1">
            <Button variant="primary" tone={PALETTE.blue.hex} onPress={() => act('startPlanning')}>
              Start planning
            </Button>
          </div>
        </Section>
      )}

      {f?.requirements && (
        <Section
          icon={mdiFormatListChecks}
          title="Requirements"
          caption="Each one has a check: a test or a click path"
          aside={f.requirements.length}
          accent="blue"
          theme={theme}
        >
          <TicketRows>
            {f.requirements.map((r) => (
              <TicketRow
                key={r.id}
                lead={r.id}
                theme={theme}
                sub={
                  <>
                    <Dot color={PALETTE.blue.hex} />
                    {r.check}
                  </>
                }
              >
                {r.text}
              </TicketRow>
            ))}
          </TicketRows>
        </Section>
      )}

      {f?.questions && (
        <Section
          icon={mdiHelpCircleOutline}
          title="Questions"
          caption="Only the ones that change what gets built"
          accent="violet"
          theme={theme}
        >
          <TicketRows>
            {f.questions.map((q, i) => (
              <TicketRow
                key={i}
                state={q.a ? 'done' : undefined}
                lead="?"
                theme={theme}
                sub={
                  q.a || (
                    <span style={{ color: ink('violet', theme) }}>Waiting for your answer</span>
                  )
                }
              >
                {q.q}
              </TicketRow>
            ))}
          </TicketRows>
        </Section>
      )}

      {f?.steps && (
        <Section
          icon={mdiChartBar}
          title="Plan"
          caption="Small steps; each names the requirements it covers"
          aside={`${f.steps.length} steps`}
          accent="blue"
          theme={theme}
        >
          <TicketRows>
            {f.steps.map((s) => (
              <TicketRow
                key={s.n}
                lead={String(s.n)}
                theme={theme}
                end={
                  s.covers.length ? (
                    <span className="font-mono text-[11px] text-muted">{s.covers.join(' ')}</span>
                  ) : null
                }
              >
                {s.text}
              </TicketRow>
            ))}
          </TicketRows>
        </Section>
      )}

      <TicketText d={d} theme={theme} />
    </>
  );
}
