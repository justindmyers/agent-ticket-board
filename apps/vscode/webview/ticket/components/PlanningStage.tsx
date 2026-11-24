import { mdiChartBar, mdiFormatListChecks, mdiInformationOutline } from '@mdi/js';
import { Button } from '../../shared/components/Button';
import { Dot } from '../../shared/components/Dot';
import { Section } from '../../shared/components/Section';
import type { Detail } from '../../shared/types/host';
import type { Theme } from '../../shared/types/theme';
import { PALETTE, runActive } from '@agent-ticket-board/core/look';
import type { Act } from '../types/ticket';
import { canStartPlanning } from '../utils/ticket';
import { AssumptionsSection } from './AssumptionsSection';
import { EarlierAnswers } from './EarlierAnswers';
import { QuestionsSection } from './QuestionsSection';
import { RunSection } from './RunSection';
import { WritesSection } from './WritesSection';
import { TicketRow } from './TicketRow';
import { TicketRows } from './TicketRows';
import { TicketText } from './TicketText';

type Props = { d: Detail; act: Act; theme: Theme };

export function PlanningStage({ d, act, theme }: Props) {
  const f = d.flow;
  const draft = !!f?.questions?.some((q) => !q.a);

  return (
    <>
      {f?.run?.stage === 'planning' && runActive(f) && (
        <RunSection run={f.run} act={act} theme={theme} />
      )}

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

      {!!f?.questions?.length && (
        <QuestionsSection ticketKey={d.ticket.key} questions={f.questions} theme={theme} />
      )}

      {!!f?.assumptions?.length && <AssumptionsSection assumptions={f.assumptions} theme={theme} />}

      {f?.requirements && <WritesSection writes={f.writes ?? []} stage="planning" theme={theme} />}

      {!!f?.answered?.length && (
        <EarlierAnswers ticketKey={d.ticket.key} answered={f.answered} theme={theme} />
      )}

      {f?.requirements && (
        <Section
          icon={mdiFormatListChecks}
          title="Requirements"
          caption={
            draft
              ? 'Draft: it can change after your answers'
              : 'Each one has a check: a test or a click path'
          }
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

      {f?.steps && (
        <Section
          icon={mdiChartBar}
          title="Plan"
          caption={
            draft
              ? 'Draft: it can change after your answers'
              : 'Small steps; each names the requirements it covers'
          }
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
