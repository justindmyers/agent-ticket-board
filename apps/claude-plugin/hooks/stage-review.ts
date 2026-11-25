import type { EngineInterface } from 'claude-code';
import { hex, kit, type Ctx } from './kit';
import { runBox } from './run-box';
import { store } from './store';
import { commitRows } from './commit-rows';
import { gateRows } from './gate-rows';
import { reviewRows } from './review-rows';
import type { Flow } from './types';

export function stageReview($: EngineInterface, ctx: Ctx, f: Flow) {
  const { Text, Link } = ctx.els;
  const { dim, sectionTitle } = kit(ctx);
  const pr = f.pr;
  const head = [
    ...runBox($, ctx, store.open ?? '', f, 'code-review'),
    ...reviewRows(ctx, f),
    ...commitRows(ctx, f),
    ...gateRows(ctx, f)
  ];
  if (!pr) {
    return head.length ? head : [dim('No pull request yet.')];
  }

  return [
    ...head,
    sectionTitle('pr', 'Pull request #' + pr.number, hex(pr.failing ? 'red' : 'green'), pr.state),
    dim('Another person reviews it on GitHub. The stage ends at the merge.'),
    Text({
      wrap: 'wrap',
      children: [`Checks: ${pr.checks}   Reviews: ${pr.reviews}   Comments: ${pr.comments}`]
    }),
    Link({ href: pr.url, label: 'Open pull request #' + pr.number })
  ];
}
