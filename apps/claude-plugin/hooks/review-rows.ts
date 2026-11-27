import type { EngineInterface, RenderElement } from 'claude-code';
import { atb, errorText, reloadTicket } from './cli';
import { hex, kit, type Ctx } from './kit';
import type { Flow } from './types';

const MARK = { fixed: '✓ ', open: '✗ ', dropped: '○ ' } as const;

/** The review round of the Code review tab: each finding with what became of it. */
export function reviewRows($: EngineInterface, ctx: Ctx, key: string, f: Flow): RenderElement[] {
  const r = f.codeReview;
  if (!r) {
    return [];
  }
  const { Box, Text, Button } = ctx.els;
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
          ...(x.note
            ? [
                dim(
                  `    ${{ fixed: 'Note', open: 'Not fixed because', dropped: 'Dropped because' }[x.state]}: ${x.note}`
                )
              ]
            : []),
          ...(x.decision ? [dim(`    ${x.decision === 'fix' ? 'Will fix' : 'Dismissed'}`)] : []),
          ...(x.state === 'fixed'
            ? []
            : [
                Box({
                  key: 'choose-' + x.id,
                  flexDirection: 'row',
                  columnGap: 1,
                  paddingLeft: 4,
                  children: (x.decision
                    ? [['clear', 'Undo']]
                    : [
                        ['fix', x.state === 'dropped' ? 'Fix anyway' : 'Fix'],
                        ...(x.state === 'open' ? [['dismiss', 'Dismiss']] : [])
                      ]
                  ).map(([choice, label]) =>
                    Button({
                      key: `${choice}-${x.id}`,
                      label: label!,
                      onPress: async () => {
                        try {
                          await atb($, ['finding', key, x.id, choice!]);
                        } catch (e) {
                          $.ui.toast(`${key}: ${errorText(e)}`);
                        }
                        await reloadTicket($, key);
                      }
                    })
                  )
                })
              ])
        ]
      })
    )
  ];
}
