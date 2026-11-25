import { mdiOpenInNew, mdiSourceBranch } from '@mdi/js';
import { runActive } from '@agent-ticket-board/core/look';
import { Button } from '../../shared/components/Button';
import { Icon } from '../../shared/components/Icon';
import { Section } from '../../shared/components/Section';
import type { Flow } from '../../shared/types/host';
import type { Theme } from '../../shared/types/theme';
import type { Act } from '../types/ticket';
import { ChecksSection } from './ChecksSection';
import { GateSection } from './GateSection';
import { ReviewSection } from './ReviewSection';
import { RunSection } from './RunSection';

type Props = { f: Flow; act: Act; theme: Theme };

export function CodeReviewStage({ f, act, theme }: Props) {
  const review = (
    <>
      {f.run?.stage === 'code-review' && runActive(f) && (
        <RunSection run={f.run} act={act} theme={theme} />
      )}
      {f.codeReview && <ReviewSection review={f.codeReview} theme={theme} />}
      {f.gate && <GateSection gate={f.gate} theme={theme} />}
    </>
  );
  if (!f.pr) {
    return (
      <>
        {review}
        {!f.codeReview && !runActive(f) && <p className="px-1 text-muted">No pull request yet.</p>}
      </>
    );
  }
  const facts = [
    ['State', f.pr.state ?? 'Open'],
    ['Checks', f.pr.checks],
    ['Reviews', f.pr.reviews],
    ['Comments', String(f.pr.comments)]
  ];

  return (
    <>
      {review}
      <Section
        icon={mdiSourceBranch}
        title={`Pull request #${f.pr.number}`}
        caption="Another person reviews it on GitHub. The stage ends at the merge."
        accent={f.pr.failing ? 'red' : 'green'}
        theme={theme}
        aside={
          <Button variant="ghost" className="h-7 px-2" onPress={() => act('openPr')}>
            Open
            <Icon path={mdiOpenInNew} size={13} />
          </Button>
        }
      >
        <div className="grid grid-cols-2 gap-2 pt-1 @[560px]:grid-cols-4">
          {facts.map(([k, v]) => (
            <div key={k} className="rounded-lg border border-ink/[0.07] bg-ink/[0.025] px-2.5 py-2">
              <div className="text-[11px] text-muted">{k}</div>
              <div className="text-[13px] font-medium text-ink/90">{v}</div>
            </div>
          ))}
        </div>
      </Section>

      <ChecksSection f={f} title="CI" theme={theme} />
    </>
  );
}
