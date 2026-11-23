import type { Detail } from '../../shared/types/host';
import type { Theme } from '../../shared/types/theme';
import { ago } from '../../shared/utils/ago';
import { tile } from '../../shared/utils/surfaces';

type Props = { comments: Detail['comments']; theme: Theme };

export function CommentList({ comments, theme }: Props) {
  if (!comments.length) {
    return null;
  }

  return (
    <ul className="m-0 mb-2 list-none p-0">
      {comments.map((c) => (
        <li
          key={c.id}
          className="grid grid-cols-[28px_minmax(0,1fr)] gap-3 border-t border-ink/[0.06] py-2.5 first:border-t-0 first:pt-1"
        >
          <span
            aria-hidden="true"
            className="grid size-7 place-items-center rounded-full border text-[11px] font-semibold"
            style={tile('blue', theme)}
          >
            Y
          </span>
          <div>
            <div className="mb-0.5 text-[11px] text-muted">
              You · {ago(c.at)}
              {c.ran ? ' · sent to the agent' : ''}
            </div>
            <div className="[overflow-wrap:anywhere] whitespace-pre-wrap text-soft">{c.text}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}
