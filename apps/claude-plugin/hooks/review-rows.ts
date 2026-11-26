import type { RenderElement } from 'claude-code';
import { hex, kit, type Ctx } from './kit';
import type { Flow } from './types';

const MARK = { fixed: '✓ ', open: '✗ ', dropped: '○ ' } as const;

/** The review round of the Code review tab: each finding with what became of it. */
export function reviewRows(ctx: Ctx, f: Flow): RenderElement[] {
  const r = f.codeReview;
  if (!r) {
    return [];
  }
  const { Box, Text } = ctx.els;
  const { sectionTitle, dim } = kit(ctx);
  const bad = r.findings.some((x) => x.state === 'open' && x.severity === 'blocking');
  return [
    sectionTitle(
      'review',
      'Review',
      hex(bad ? 'red' : 'green'),
      r.findings.filter((x) => x.state === 'fixed').length + ' fixed'
    ),
    Text({ wrap: 'wrap', children: [r.summary] }),
    ...r.findings.map((x) =>
      Box({
        key: 'finding-' + x.id,
        flexDirection: 'column',
        children: [
          Text({
            color: hex(x.state === 'fixed' ? 'green' : x.state === 'open' ? 'red' : 'neutral'),
            wrap: 'wrap',
            children: [MARK[x.state] + x.id + '  ' + x.problem]
          }),
          dim(
            `    ${x.line ? x.file + ':' + x.line : x.file} · ${x.reviewer}${x.severity === 'style' ? ' · style' : ''}`
          ),
          dim('    Fix: ' + x.fix),
          ...(x.note ? [dim('    ' + x.note)] : [])
        ]
      })
    )
  ];
}
