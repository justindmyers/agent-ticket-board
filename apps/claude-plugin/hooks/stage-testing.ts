import type { EngineInterface } from 'claude-code';
import { hex, kit, type Ctx } from './kit';
import type { Flow } from './types';

export function stageTesting($: EngineInterface, ctx: Ctx, f: Flow) {
  const { Box, Text, Link } = ctx.els;
  const { sectionTitle } = kit(ctx);
  const reqs = f.requirements ?? [];
  const met = reqs.filter((r) => r.met).length;

  return [
    sectionTitle('tc', 'Test checklist', hex('amber'), met + ' of ' + reqs.length),
    ...(f.app ? [Link({ href: f.app, label: 'Open app  ' + f.app })] : []),
    ...reqs.map((r) =>
      Box({
        key: 'tr-' + r.id,
        flexDirection: 'column',
        children: [
          Text({
            wrap: 'wrap',
            children: [(r.met ? '✓ ' : '○ ') + r.id + '  ' + r.text]
          }),
          Text({
            color: r.evidence ? hex('green') : undefined,
            dimColor: !r.evidence,
            wrap: 'wrap',
            children: ['    ' + r.check + '  ·  ' + (r.evidence?.label ?? 'no evidence')]
          })
        ]
      })
    )
  ];
}
