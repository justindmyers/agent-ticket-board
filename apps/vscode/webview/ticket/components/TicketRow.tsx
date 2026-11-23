import type { ReactNode } from 'react';
import { Icon } from '../../shared/components/Icon';
import type { Theme } from '../../shared/types/theme';
import { cx } from '../../shared/utils/cx';
import { tile } from '../../shared/utils/surfaces';
import type { RowState } from '../types/ticket';
import { ROW_STATES } from '../utils/rowStates';

type Props = {
  state?: RowState;
  lead?: string;
  children: ReactNode;
  sub?: ReactNode;
  end?: ReactNode;
  theme: Theme;
};

export function TicketRow({ state, lead, children, sub, end, theme }: Props) {
  const s = state ? ROW_STATES[state] : null;

  return (
    <li className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 border-t border-ink/[0.06] py-2.5 first:border-t-0 first:pt-1">
      <span
        className="grid size-7 place-items-center rounded-lg border font-mono text-[11px]"
        style={tile(s?.accent ?? 'neutral', theme)}
        role={s ? 'img' : undefined}
        aria-label={s ? `${s.label}${lead ? ' ' + lead : ''}` : undefined}
      >
        {s ? <Icon path={s.icon} size={15} /> : <span className="text-muted">{lead}</span>}
      </span>
      <span
        className={cx(
          'min-w-0 pt-0.5 leading-snug [overflow-wrap:anywhere]',
          state === 'done' ? 'text-muted' : 'text-ink/90'
        )}
      >
        {children}
      </span>
      <span className="pt-0.5">{end}</span>
      {sub && (
        <span className="col-start-2 col-end-4 flex items-center gap-1.5 text-[12px] text-muted">
          {sub}
        </span>
      )}
    </li>
  );
}
