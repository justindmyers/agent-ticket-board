import type { EngineInterface } from 'claude-code';
import { hex, kit, type Ctx } from './kit';
import type { Flow } from './types';

export function stageReview($: EngineInterface, ctx: Ctx, f: Flow) {
  const { Text, Link } = ctx.els;
  const { dim, sectionTitle } = kit(ctx);
  const pr = f.pr;
  if (!pr) {
    return [dim('No pull request yet.')];
  }

  return [
    sectionTitle('pr', 'Pull request #' + pr.number, hex(pr.failing ? 'red' : 'green'), pr.state),
    dim('Another person reviews it on GitHub. The stage ends at the merge.'),
    Text({
      wrap: 'wrap',
      children: [`Checks: ${pr.checks}   Reviews: ${pr.reviews}   Comments: ${pr.comments}`]
    }),
    Link({ href: pr.url, label: 'Open pull request #' + pr.number })
  ];
}
