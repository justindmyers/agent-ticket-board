import type { EngineInterface } from 'claude-code';
import { hex, kit, type Ctx } from './kit';
import { runBox } from './run-box';
import { store } from './store';
import { commitRows } from './commit-rows';
import { gateRows } from './gate-rows';
import { prRows } from './pr-rows';
import { pushRows } from './push-rows';
import type { Flow } from './types';

/**
 * Ship: the pull request, the push, the checks before the push and the commits, the newest step first.
 * The step that the banner asks you to approve is the one on top, so you see it before you press.
 */
export function stageShip($: EngineInterface, ctx: Ctx, f: Flow) {
  const { Text, Link } = ctx.els;
  const { dim, sectionTitle } = kit(ctx);
  const pr = f.pr;
  const head = [
    ...runBox($, ctx, store.open ?? '', f, 'ship'),
    ...prRows(ctx, f),
    ...pushRows(ctx, f),
    ...(f.gate && !f.gate.verify ? gateRows(ctx, f) : []),
    ...commitRows(ctx, f)
  ];
  if (!pr) {
    return head.length
      ? head
      : [dim('Nothing is shipped yet. The commits start after the review.')];
  }

  if (f.prPlan) {
    // One card for the pull request: prRows shows GitHub's state with the title and the body.
    return head;
  }
  return [
    ...head,
    sectionTitle('pr', 'Pull request #' + pr.number, hex(pr.failing ? 'red' : 'green'), pr.state),
    dim('Another person reviews it on GitHub. The stage ends at the merge.'),
    Text({
      wrap: 'wrap',
      children: [`Checks: ${pr.checks}   Reviews: ${pr.reviews}   Comments: ${pr.comments}`]
    }),
    Link({ href: pr.url, label: 'View pull request #' + pr.number })
  ];
}
