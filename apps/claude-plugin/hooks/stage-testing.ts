import { writeRows } from './writes';
import type { EngineInterface, RenderElement } from 'claude-code';
import { openShot } from './cli';
import { hex, kit, type Ctx } from './kit';
import { shotGroups, shotLabel } from './look.gen';
import { runBox } from './run-box';
import { store } from './store';
import type { Flow } from './types';

/** The Testing tab: the run, then each requirement with its result, what the agent saw, and its screenshots. */
export function stageTesting($: EngineInterface, ctx: Ctx, f: Flow) {
  const { Box, Text, Button } = ctx.els;
  const { sectionTitle, dim } = kit(ctx);
  const reqs = f.requirements ?? [];
  const passing = reqs.filter((r) => f.evidence?.[r.id]?.ok).length;
  const body: RenderElement[] = [
    ...runBox($, ctx, store.open ?? '', f, 'testing'),
    ...writeRows(ctx, f, 'testing')
  ];

  body.push(
    sectionTitle('ev', 'Evidence', hex('amber'), passing + ' of ' + reqs.length),
    ...reqs.map((r) => {
      const ev = f.evidence?.[r.id];
      const mark = !ev ? '○ ' : ev.ok ? '✓ ' : '✗ ';
      return Box({
        key: 'ev-' + r.id,
        flexDirection: 'column',
        children: [
          Text({
            color: ev ? hex(ev.ok ? 'green' : 'red') : undefined,
            wrap: 'wrap',
            children: [mark + r.id + '  ' + r.text]
          }),
          ...(ev?.data
            ? [dim('    ' + { real: 'Real data', fake: 'Fake data', none: 'Test only' }[ev.data])]
            : []),
          dim('    ' + r.check + (ev ? '' : '  ·  not tested')),
          ...(ev && !ev.ok
            ? (
                [
                  ['Expected', ev.expected],
                  ['Found', ev.found],
                  ['Tried', ev.note]
                ] as const
              )
                .filter(([, text]) => text)
                .map(([label, text]) =>
                  Text({ color: hex('red'), wrap: 'wrap', children: [`    ${label}: ${text}`] })
                )
            : []),
          ...(ev?.seen ? [Text({ wrap: 'wrap', children: ['    ' + ev.seen] })] : []),
          ...(ev?.note && ev.ok ? [dim('    ' + ev.note)] : []),
          ...(ev?.test ? [dim('    ' + ev.test)] : []),
          // Each screenshot set: every size in light and dark, named when there is more than one.
          ...shotGroups(ev?.shots ?? []).flatMap((g, gi, all) => [
            ...(all.length > 1 ? [dim('    ' + g.set)] : []),
            // A line for each size, with its light and dark shots side by side.
            ...[...new Set(g.shots.map((s) => shotLabel(s).split(' ')[1] ?? ''))].map((size) =>
              Box({
                key: `shots-${r.id}-${gi}-${size}`,
                flexDirection: 'row',
                columnGap: 1,
                paddingLeft: 4,
                children: [
                  dim(size.padEnd(10)),
                  ...g.shots
                    .filter((s) => shotLabel(s).endsWith(' ' + size))
                    .map((s) =>
                      Button({
                        key: `shot-${r.id}-${gi}-${g.shots.indexOf(s)}`,
                        label: shotLabel(s).split(' ')[0]!,
                        onPress: () => void openShot($, store.open ?? '', s)
                      })
                    )
                ]
              })
            )
          ])
        ]
      });
    })
  );
  if (f.review && f.evidence) {
    body.push(
      sectionTitle('sum', 'Agent summary', hex('violet')),
      Text({ wrap: 'wrap', children: [f.review] })
    );
  }
  return body;
}
