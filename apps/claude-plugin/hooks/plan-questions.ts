import type { EngineInterface, RenderElement } from 'claude-code';
import { answer } from './cli';
import { hex, kit, type Ctx } from './kit';
import { store } from './store';
import type { Detail } from './types';

type Question = NonNullable<NonNullable<Detail['flow']>['questions']>[number];

/** One plan question: why it matters, then the options as buttons and a field for another answer. */
function questionRows($: EngineInterface, ctx: Ctx, key: string, q: Question, n: number) {
  const { Box, Text, Button, Input } = ctx.els;
  const { dim } = kit(ctx);
  const id = `${key}:${n}`;
  const rows: RenderElement[] = [
    Text({ wrap: 'wrap', children: [`${n}. ${q.q}`] }),
    ...(q.why ? [dim(`   ${q.why}`)] : [])
  ];
  if (q.a && store.changing !== id) {
    rows.push(
      Box({
        key: `qa-${n}`,
        flexDirection: 'row',
        columnGap: 1,
        children: [
          Text({ color: hex('green'), wrap: 'wrap', children: [`   ✓ ${q.a}`] }),
          Button({
            key: `change-${n}`,
            label: 'Change',
            plain: true,
            onPress: () => {
              store.changing = id;
              ctx.redraw();
            }
          })
        ]
      })
    );
    return rows;
  }
  const options = q.options ?? [];
  if (options.length) {
    rows.push(
      Box({
        key: `qo-${n}`,
        flexDirection: 'row',
        columnGap: 1,
        flexWrap: 'wrap',
        children: options.map((o, i) =>
          Button({
            key: `opt-${n}-${i}`,
            label: q.recommended === i ? `${o} (recommended)` : o,
            variant: q.recommended === i ? 'primary' : 'secondary',
            onPress: () => void answer($, key, n, o)
          })
        )
      })
    );
  }
  rows.push(
    Input({
      key: `other-${n}`,
      label: options.length ? 'Other answer' : 'Your answer',
      placeholder: 'Type an answer',
      value: '',
      submitLabel: 'save',
      onSubmit: (v: string) => {
        if (v.trim()) {
          void answer($, key, n, v);
        }
      }
    })
  );
  return rows;
}

/** The plan's questions, first on the Planning tab. */
export function planQuestions($: EngineInterface, ctx: Ctx, d: Detail): RenderElement[] {
  const qs = d.flow?.questions ?? [];
  if (!qs.length) {
    return [];
  }
  const { sectionTitle, dim } = kit(ctx);
  const open = qs.filter((q) => !q.a).length;
  return [
    sectionTitle('q', 'Questions', hex('violet'), open ? `${open} open` : 'All answered'),
    dim(
      open
        ? 'Your answers change what gets built. Re-plan when you have answered them.'
        : 'All answered. Re-plan to use your answers.'
    ),
    ...qs.flatMap((q, i) => questionRows($, ctx, d.ticket.key, q, i + 1))
  ];
}

/** The answers from earlier plans: a toggle, then each answer with Change. */
export function earlierAnswers($: EngineInterface, ctx: Ctx, d: Detail): RenderElement[] {
  const list = d.flow?.answered ?? [];
  if (!list.length) {
    return [];
  }
  const { Box, Text, Button, Input } = ctx.els;
  const { sectionTitle, dim } = kit(ctx);
  const key = d.ticket.key;
  const open = !!store.showEarlier[key];
  const rows: RenderElement[] = [
    sectionTitle('earlier', 'Earlier answers', hex('violet'), String(list.length)),
    Button({
      key: 'earlier-toggle',
      label: open ? 'Hide earlier answers' : `Show ${list.length} earlier answers`,
      plain: true,
      onPress: () => {
        store.showEarlier[key] = !open;
        ctx.redraw();
      }
    })
  ];
  if (!open) {
    return rows;
  }
  rows.push(dim('The plan is based on these. A change asks for a re-plan.'));
  list.forEach((x, i) => {
    const n = i + 1;
    const id = `${key}:earlier:${n}`;
    rows.push(Text({ wrap: 'wrap', children: [x.q] }));
    rows.push(
      store.changing === id
        ? Input({
            key: `earlier-input-${n}`,
            label: 'New answer',
            placeholder: x.a,
            value: x.a,
            submitLabel: 'save',
            onSubmit: (v: string) => {
              if (v.trim()) {
                void answer($, key, n, v, true);
              }
            }
          })
        : Box({
            key: `earlier-${n}`,
            flexDirection: 'row',
            columnGap: 1,
            children: [
              Text({ color: hex('green'), wrap: 'wrap', children: [`   ✓ ${x.a}`] }),
              Button({
                key: `earlier-change-${n}`,
                label: 'Change',
                plain: true,
                onPress: () => {
                  store.changing = id;
                  ctx.redraw();
                }
              })
            ]
          })
    );
  });
  return rows;
}

/** What the agent decided where the ticket is not clear. */
export function assumptionRows(ctx: Ctx, d: Detail): RenderElement[] {
  const list = d.flow?.assumptions ?? [];
  if (!list.length) {
    return [];
  }
  const { Text } = ctx.els;
  const { sectionTitle, dim } = kit(ctx);
  return [
    sectionTitle('assume', 'Assumptions', hex('amber'), String(list.length)),
    dim('The agent decided these. To change one, add a comment and re-plan.'),
    ...list.map((a, i) => Text({ wrap: 'wrap', children: [`${i + 1}. ${a}`] }))
  ];
}
