import type { RenderElement } from 'claude-code';
import { hex, kit, type Ctx } from './kit';
import { stepView } from './look.gen';
import type { Flow } from './types';

/** The checks before a push, in the order that they ran. The first failure ends the list. */
export function gateRows(ctx: Ctx, f: Flow): RenderElement[] {
  const g = f.gate;
  if (!g) {
    return [];
  }
  const { Box, Text } = ctx.els;
  const { sectionTitle, dim } = kit(ctx);
  return [
    sectionTitle(
      'gate',
      'Checks before a push',
      hex(g.ok ? 'green' : 'red'),
      `${g.steps.filter((s) => s.ok).length} of ${g.steps.length}`
    ),
    ...g.steps.map((s) => {
      const v = stepView(s);
      return Box({
        key: 'gate-' + s.name,
        flexDirection: 'column',
        children: [
          Text({
            color: hex(s.ok ? 'green' : 'red'),
            wrap: 'wrap',
            children: [(s.ok ? '✓ ' : '✗ ') + v.label]
          }),
          ...(v.command ? [dim('    ' + v.command)] : []),
          ...(s.note ? [dim('    ' + s.note.split('\n').join('\n    '))] : [])
        ]
      });
    })
  ];
}
