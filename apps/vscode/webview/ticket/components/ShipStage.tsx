import { mdiOpenInNew, mdiSourceBranch } from '@mdi/js';
import { runActive } from '@agent-ticket-board/core/look';
import { Button } from '../../shared/components/Button';
import { Icon } from '../../shared/components/Icon';
import { Section } from '../../shared/components/Section';
import type { Flow } from '../../shared/types/host';
import type { Theme } from '../../shared/types/theme';
import type { Act } from '../types/ticket';
import { ChecksSection } from './ChecksSection';
import { CommitsSection } from './CommitsSection';
import { GateSection } from './GateSection';
import { PushSection } from './PushSection';
import { RunSection } from './RunSection';

type Props = { f: Flow; act: Act; theme: Theme };

/** Ship: the commits, the checks before the push, the push, and the pull request up to the merge. */
export function ShipStage({ f, act, theme }: Props) {
  const running = f.run?.stage === 'ship' && runActive(f);
  const steps = (
    <>
      {running && <RunSection run={f.run!} act={act} theme={theme} />}
      {f.commits && <CommitsSection commits={f.commits} theme={theme} />}
      {f.gate && !f.gate.verify && <GateSection gate={f.gate} theme={theme} />}
      {f.push && <PushSection push={f.push} act={act} theme={theme} />}
    </>
  );
  if (!f.pr) {
    return (
      <>
        {steps}
        {!f.commits && !f.gate && !f.push && !running && (
          <p className="px-1 text-muted">
            Nothing is shipped yet. The commits start after the review.
          </p>
        )}
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
      {steps}
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
