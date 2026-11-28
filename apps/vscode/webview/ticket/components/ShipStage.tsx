import { runActive } from '@agent-ticket-board/core/look';
import type { Flow } from '../../shared/types/host';
import type { Theme } from '../../shared/types/theme';
import type { Act } from '../types/ticket';
import { ChecksSection } from './ChecksSection';
import { CommitsSection } from './CommitsSection';
import { GateSection } from './GateSection';
import { LivePullRequest } from './LivePullRequest';
import { PullRequestSection } from './PullRequestSection';
import { PushSection } from './PushSection';
import { RunSection } from './RunSection';

type Props = { f: Flow; act: Act; theme: Theme };

/**
 * Ship: the pull request, the push, the checks before the push and the commits, the newest step first.
 * The step that the banner asks you to approve is the one on top, so you see it before you press.
 */
export function ShipStage({ f, act, theme }: Props) {
  const running = f.run?.stage === 'ship' && runActive(f);
  const steps = (
    <>
      {running && <RunSection run={f.run!} act={act} theme={theme} />}
      {f.prPlan && <PullRequestSection plan={f.prPlan} live={f.pr} act={act} theme={theme} />}
      {f.push && <PushSection push={f.push} act={act} theme={theme} />}
      {f.gate && !f.gate.verify && <GateSection gate={f.gate} theme={theme} />}
      {f.commits && <CommitsSection commits={f.commits} theme={theme} />}
    </>
  );
  if (!f.pr) {
    return (
      <>
        {steps}
        {!f.commits && !f.gate && !f.push && !f.prPlan && !running && (
          <p className="px-1 text-muted">
            Nothing is shipped yet. The commits start after the review.
          </p>
        )}
      </>
    );
  }
  return (
    <>
      {steps}
      {!f.prPlan && <LivePullRequest pr={f.pr} act={act} theme={theme} />}

      <ChecksSection f={f} title="CI" theme={theme} />
    </>
  );
}
