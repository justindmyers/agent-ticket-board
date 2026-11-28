import type { RenderElement } from 'claude-code';
import { hex, kit, type Ctx } from './kit';
import { store } from './store';
import type { Flow } from './types';

/**
 * The draft pull request: what the board will make, shown before it is made, and the address after.
 * The title, the body and the screenshots are the ones that GitHub gets.
 * Once GitHub has the pull request, this is the one card for it, with GitHub's state on top.
 */
export function prRows(ctx: Ctx, f: Flow): RenderElement[] {
  const p = f.prPlan;
  if (!p) {
    return [];
  }
  const { Box, Text, Link, Button } = ctx.els;
  const { sectionTitle, dim } = kit(ctx);
  const updating = !!p.update;
  const made = !!p.createdAt && !updating;
  const live = f.pr;
  const showBody = !live || updating || !!store.collapsed['pr-body-open'];
  const n = p.attach.length;
  const fact = (label: string, value: string) =>
    Box({
      key: 'pr-' + label,
      children: [
        Text({ wrap: 'wrap', children: [`${label}: `] }),
        Text({ wrap: 'wrap', children: [value] })
      ]
    });
  return [
    sectionTitle(
      'pr-plan',
      live ? 'Pull request #' + live.number : 'Draft pull request',
      hex(updating ? 'rose' : live?.failing ? 'red' : made || live ? 'green' : 'rose'),
      updating
        ? 'Update preview'
        : live
          ? (live.state ?? 'Open')
          : made
            ? p.updatedAt
              ? 'Updated'
              : 'Draft open'
            : 'Preview'
    ),
    dim(
      updating
        ? 'This replaces the title and the body of the pull request on GitHub. Nothing changes until you approve.'
        : live
          ? 'Another person reviews it on GitHub. The stage ends at the merge.'
          : made
            ? p.updatedAt
              ? 'The pull request is updated. It stays a draft until you mark it ready.'
              : 'The draft is open on GitHub. It stays a draft until you mark it ready.'
            : 'This is what GitHub will get. Nothing is made until you approve. It will be a draft.'
    ),
    ...(p.warning ? [Text({ color: hex('amber'), wrap: 'wrap', children: [p.warning] })] : []),
    ...(live
      ? [
          Text({
            wrap: 'wrap',
            children: [
              `Checks: ${live.checks}   Reviews: ${live.reviews}   Comments: ${live.comments}`
            ]
          }),
          Button({
            key: 'pr-body-toggle',
            label: (showBody ? '▾ ' : '▸ ') + 'Title and body',
            onPress: () => {
              store.collapsed['pr-body-open'] = !store.collapsed['pr-body-open'];
              ctx.redraw();
            }
          })
        ]
      : []),
    ...(showBody
      ? [
          // What GitHub gets comes first: the title and the body. The branches and the counts follow.
          fact('Title', p.title),
          Text({ wrap: 'wrap', children: ['Body:'] }),
          Box({
            key: 'pr-body',
            children: [Text({ wrap: 'wrap', dimColor: true, children: [p.body.trimEnd()] })]
          }),
          fact('Branches', `${p.head} into ${p.base}`),
          fact(
            'Includes',
            `${p.commits} ${p.commits === 1 ? 'commit' : 'commits'}, ${n} ${n === 1 ? 'screenshot' : 'screenshots'}`
          )
        ]
      : []),
    ...((made && p.url) || live
      ? [
          Link({
            href: live?.url ?? p.url ?? '',
            label: live ? 'View on GitHub' : 'View the pull request'
          })
        ]
      : [])
  ];
}
