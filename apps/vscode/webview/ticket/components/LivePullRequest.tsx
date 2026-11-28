import { actionHelp } from '@agent-ticket-board/core/look';
import { mdiOpenInNew, mdiSourceBranch } from '@mdi/js';
import { Button } from '../../shared/components/Button';
import { Icon } from '../../shared/components/Icon';
import { Section } from '../../shared/components/Section';
import type { Flow } from '../../shared/types/host';
import type { Theme } from '../../shared/types/theme';
import type { Act } from '../types/ticket';
import { PullRequestFacts } from './PullRequestFacts';

type Props = { pr: NonNullable<Flow['pr']>; act: Act; theme: Theme };

/** A pull request that the board did not make: only GitHub's state. There is no draft to show. */
export function LivePullRequest({ pr, act, theme }: Props) {
  return (
    <Section
      icon={mdiSourceBranch}
      title={`Pull request #${pr.number}`}
      caption="Another person reviews it on GitHub. The stage ends at the merge."
      accent={pr.failing ? 'red' : 'green'}
      theme={theme}
      aside={
        <Button
          variant="ghost"
          className="h-7 px-2"
          onPress={() => act('openPr')}
          help={actionHelp('openPr')}
        >
          View on GitHub
          <Icon path={mdiOpenInNew} size={13} />
        </Button>
      }
    >
      <PullRequestFacts pr={pr} />
    </Section>
  );
}
