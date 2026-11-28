import type { RenderElement } from 'claude-code';
import { hex, kit, type Ctx } from './kit';
import { outsideMark } from './look.gen';
import type { Detail } from './types';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Work that was done outside the board: files changed in the worktree and commits that the board did
 * not make. The plan, the tests and the review did not see it until the developer takes it in.
 */
export function outsideRows(ctx: Ctx, outside: Detail['outside']): RenderElement[] {
  if (!outside || (!outside.files.length && !outside.commits.length)) {
    return [];
  }
  const { Box, Text } = ctx.els;
  const { sectionTitle, dim } = kit(ctx);
  const { files, commits } = outside;
  const aside = [
    files.length && plural(files.length, 'file changed', 'files changed'),
    commits.length && plural(commits.length, 'commit', 'commits')
  ]
    .filter(Boolean)
    .join(' and ');
  return [
    sectionTitle('outside', 'Changes outside the board', hex('amber'), aside),
    dim('The board did not make these. The plan, the tests and the review may not include them.'),
    ...commits.map((c) =>
      Box({
        key: 'commit-' + c.sha,
        children: [Text({ wrap: 'wrap', children: [`◆ ${c.title}  ${c.short}`] })]
      })
    ),
    ...files.map((x) =>
      Box({
        key: 'file-' + x.path,
        children: [Text({ wrap: 'wrap', children: [`${outsideMark(x.kind)} ${x.path}`] })]
      })
    )
  ];
}
