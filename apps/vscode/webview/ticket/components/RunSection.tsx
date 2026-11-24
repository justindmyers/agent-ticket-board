import { mdiProgressClock } from '@mdi/js';
import { Button } from '../../shared/components/Button';
import { Section } from '../../shared/components/Section';
import type { AgentRun } from '../../shared/types/host';
import type { Theme } from '../../shared/types/theme';
import type { Act } from '../types/ticket';

type Props = { run: AgentRun; act: Act; theme: Theme };

/** A queued or running agent run, with Stop. */
export function RunSection({ run, act, theme }: Props) {
  const queued = run.state === 'queued';
  const building = run.stage === 'development';

  return (
    <Section
      icon={mdiProgressClock}
      title={queued ? 'Queued' : building ? 'Building now' : 'Planning now'}
      caption={
        queued
          ? 'Every agent slot is busy. The run starts when one is free.'
          : building
            ? `The agent changes code in the ticket's worktree with ${run.model}. It does not commit or push.`
            : `The agent reads the ticket and the code with ${run.model}. It changes no files.`
      }
      accent={building ? 'aqua' : 'blue'}
      theme={theme}
      running={!queued}
      aside={
        <Button variant="default" className="-my-1" onPress={() => act('stopRun')}>
          Stop
        </Button>
      }
    />
  );
}
