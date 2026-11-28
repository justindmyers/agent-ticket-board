import { mdiProgressClock } from '@mdi/js';
import { actionHelp, runText } from '@agent-ticket-board/core/look';
import { Button } from '../../shared/components/Button';
import { Section } from '../../shared/components/Section';
import type { AgentRun } from '../../shared/types/host';
import type { Theme } from '../../shared/types/theme';
import type { Act } from '../types/ticket';

type Props = { run: AgentRun; act: Act; theme: Theme };

/** A queued or running agent run, with Stop. */
export function RunSection({ run, act, theme }: Props) {
  const { title, caption, accent } = runText(run);

  return (
    <Section
      icon={mdiProgressClock}
      title={title}
      caption={caption}
      accent={accent}
      theme={theme}
      running={run.state !== 'queued'}
      aside={
        <Button
          variant="default"
          className="-my-1"
          onPress={() => act('stopRun')}
          help={actionHelp('stopRun')}
        >
          Stop
        </Button>
      }
    >
      {run.activity && run.state === 'running' && !run.waiting && (
        <p className="text-xs text-soft" aria-live="polite">
          <span className="text-muted">Now: </span>
          {run.activity}
        </p>
      )}
    </Section>
  );
}
