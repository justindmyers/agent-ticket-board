import { runActive } from '@agent-ticket-board/core/look';
import type { Flow } from '../../shared/types/host';
import type { Theme } from '../../shared/types/theme';
import type { Act } from '../types/ticket';
import { GateSection } from './GateSection';
import { ReviewSection } from './ReviewSection';
import { RunSection } from './RunSection';

type Props = { f: Flow; act: Act; theme: Theme };

/** Code review: the reviewers' findings, what you chose for each, and the board's checks. */
export function CodeReviewStage({ f, act, theme }: Props) {
  const running = f.run?.stage === 'code-review' && runActive(f);
  return (
    <>
      {running && <RunSection run={f.run!} act={act} theme={theme} />}
      {f.codeReview && <ReviewSection review={f.codeReview} act={act} theme={theme} />}
      {f.gate?.verify && <GateSection gate={f.gate} theme={theme} />}
      {!f.codeReview && !running && <p className="px-1 text-muted">The review has not started.</p>}
    </>
  );
}
