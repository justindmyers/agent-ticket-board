import { outsideMark } from '@agent-ticket-board/core/look';
import { mdiSourceBranchSync } from '@mdi/js';
import { Section } from '../../shared/components/Section';
import type { Detail } from '../../shared/types/host';
import type { Theme } from '../../shared/types/theme';

type Props = { outside: NonNullable<Detail['outside']>; theme: Theme };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Work that was done outside the board: files changed in the worktree and commits that the board did
 * not make. The plan, the tests and the review did not see it until the developer takes it in.
 * One line for each, close together, because a change can touch many files.
 */
export function OutsideSection({ outside, theme }: Props) {
  const { files, commits } = outside;
  if (!files.length && !commits.length) {
    return null;
  }
  const parts = [
    files.length && plural(files.length, 'file changed', 'files changed'),
    commits.length && plural(commits.length, 'commit', 'commits')
  ].filter(Boolean);

  return (
    <Section
      icon={mdiSourceBranchSync}
      title="Changes outside the board"
      caption="The board did not make these. The plan, the tests and the review may not include them."
      aside={parts.join(' and ')}
      accent="amber"
      theme={theme}
    >
      <ul className="m-0 flex list-none flex-col p-0 font-mono text-[11.5px] leading-[1.45] text-ink/90">
        {commits.map((c) => (
          <li key={c.sha} className="flex gap-2">
            <span className="w-3 shrink-0 text-center text-muted">◆</span>
            <span className="min-w-0 [overflow-wrap:anywhere]">
              {c.title} <span className="text-muted">{c.short}</span>
            </span>
          </li>
        ))}
        {files.map((x) => (
          <li key={x.path} className="flex gap-2">
            <span className="w-3 shrink-0 text-center text-muted">{outsideMark(x.kind)}</span>
            <span className="min-w-0 [overflow-wrap:anywhere]">{x.path}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}
