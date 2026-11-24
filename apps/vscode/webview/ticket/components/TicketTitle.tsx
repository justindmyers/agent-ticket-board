import { mdiAlertCircleOutline, mdiFileDocumentOutline } from '@mdi/js';
import { Bullet } from '../../shared/components/Bullet';
import { Icon } from '../../shared/components/Icon';
import type { Detail } from '../../shared/types/host';
import type { Accent, Theme } from '../../shared/types/theme';
import { tile } from '../../shared/utils/surfaces';
import { metaParts } from '../utils/ticket';

type Props = { d: Detail; accent: Accent; stageIcon?: string; theme: Theme };

export function TicketTitle({ d, accent, stageIcon, theme }: Props) {
  const problem = d.flow?.need?.kind === 'problem';

  return (
    <div className="flex items-start gap-3">
      <span
        className="grid size-11 shrink-0 place-items-center rounded-xl border"
        style={tile(accent, theme, 'lg')}
      >
        <Icon
          path={problem ? mdiAlertCircleOutline : (stageIcon ?? mdiFileDocumentOutline)}
          size={22}
        />
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <h2
          id="ttl"
          tabIndex={-1}
          className="m-0 text-lg leading-snug font-semibold break-words text-ink/95 outline-none"
        >
          {d.ticket.summary}
        </h2>
        <span className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
          {metaParts(d.ticket, d.flow?.spent).map((x, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && <Bullet />}
              {x}
            </span>
          ))}
        </span>
      </span>
    </div>
  );
}
