import { mdiChartBar, mdiRobotOutline } from '@mdi/js';
import { Pill } from '../../shared/components/Pill';
import { Section } from '../../shared/components/Section';
import type { Flow } from '../../shared/types/host';
import type { Theme } from '../../shared/types/theme';
import { ChecksSection } from './ChecksSection';
import { TicketRow } from './TicketRow';
import { TicketRows } from './TicketRows';

type Props = { f: Flow; theme: Theme };

export function DevelopmentStage({ f, theme }: Props) {
  const done = f.steps?.filter((s) => s.state === 'done').length ?? 0;

  return (
    <>
      {f.steps && (
        <Section
          icon={mdiChartBar}
          title="Steps"
          caption="The agent builds and checks one step at a time"
          aside={`${done} of ${f.steps.length}`}
          accent="aqua"
          theme={theme}
        >
          <TicketRows>
            {f.steps.map((s) => (
              <TicketRow
                key={s.n}
                state={s.state}
                theme={theme}
                end={
                  s.state === 'current' ? (
                    <Pill accent="aqua" theme={theme}>
                      Now
                    </Pill>
                  ) : null
                }
              >
                {s.text}
              </TicketRow>
            ))}
          </TicketRows>
        </Section>
      )}

      <ChecksSection f={f} title="Final gate" theme={theme} />
      {f.review && (
        <Section
          icon={mdiRobotOutline}
          title="Agent review"
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
