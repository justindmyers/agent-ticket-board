import type { RenderElement } from 'claude-code';
import { hex, kit, type Ctx } from './kit';
import type { Flow } from './types';

/** The commits of the change: the ones made, then the ones planned, each with its files. */
export function commitRows(ctx: Ctx, f: Flow): RenderElement[] {
  const c = f.commits;
  const total = (c?.done.length ?? 0) + (c?.plan.length ?? 0);
  if (!c || !total) {
    return [];
  }
  const { Box, Text } = ctx.els;
  const { sectionTitle, dim } = kit(ctx);
  return [
    sectionTitle(
      'commits',
      'Commits',
      hex(c.plan.length ? 'amber' : 'green'),
      `${c.done.length} of ${total} made`
    ),
    ...c.done.map((x) =>
      Box({
        key: 'done-' + x.sha,
        children: [
          Text({ color: hex('green'), wrap: 'wrap', children: [`✓ ${x.title}  ${x.sha}`] })
        ]
      })
    ),
    ...c.plan.map((x) =>
      Box({
        key: 'plan-' + x.title,
        flexDirection: 'column',
        children: [
          Text({ wrap: 'wrap', children: ['○ ' + x.title] }),
          dim('    ' + x.files.join(', '))
        ]
      })
    )
  ];
}
