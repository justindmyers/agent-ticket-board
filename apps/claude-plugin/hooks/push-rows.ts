import type { RenderElement } from 'claude-code';
import { hex, kit, type Ctx } from './kit';
import { dryRunText, pushLinks } from './look.gen';
import type { Flow } from './types';

/**
 * The push of the branch: the dry run before it, and links after it. Before the push GitHub has
 * neither the branch nor the commits, so there are no links yet.
 */
export function pushRows(ctx: Ctx, f: Flow): RenderElement[] {
  const p = f.push;
  if (!p) {
    return [];
  }
  const { Box, Text, Link } = ctx.els;
  const { sectionTitle, dim } = kit(ctx);
  const pushed = !!p.pushedAt;
  const links = pushLinks(p);
  const fact = (label: string, value: string) =>
    Box({
      key: 'push-' + label,
      children: [
        Text({ wrap: 'wrap', children: [`${label}: `] }),
        Text({ wrap: 'wrap', children: [value] })
      ]
    });
  return [
    sectionTitle(
      'push',
      'Push',
      hex(pushed ? 'green' : p.stale ? 'amber' : 'rose'),
      pushed ? 'Pushed' : p.stale ? 'Out of date' : 'Dry run'
    ),
    dim(
      pushed
        ? 'The branch is on origin.'
        : p.stale
          ? 'The branch changed after this preview. Prepare the push again to see it as it is now.'
          : 'This is a dry run. Nothing is pushed until you approve.'
    ),
    fact('Branch', p.branch),
    ...(pushed ? [] : [fact('Dry run', dryRunText(p.dryRun, p.branch))]),
    fact('Command', p.command),
    ...p.commits.map((c) => {
      const url = links && c.sha ? links.commit(c.sha) : null;
      return Box({
        key: 'push-commit-' + (c.sha || c.short),
        children: [
          Text({
            color: hex(pushed ? 'green' : 'neutral'),
            wrap: 'wrap',
            children: [`${pushed ? '✓' : '•'} ${c.title}  `]
          }),
          ...(url ? [Link({ href: url, label: c.short })] : [dim(c.short)])
        ]
      });
    }),
    ...(links
      ? [
          Box({
            key: 'push-links',
            columnGap: 2,
            children: [
              Link({ href: links.branch, label: 'Open the branch' }),
              Link({ href: links.pullRequest, label: 'Open a pull request' })
            ]
          })
        ]
      : [])
  ];
}
