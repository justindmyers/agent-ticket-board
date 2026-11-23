import { useState } from 'react';
import { AgentAsk } from '../../shared/components/AgentAsk';
import { Icon } from '../../shared/components/Icon';
import { LinkButton } from '../../shared/components/LinkButton';
import { Orb } from '../../shared/components/Orb';
import type { Theme } from '../../shared/types/theme';
import { needsYou, progressText } from '../../shared/utils/agent';
import { cx } from '../../shared/utils/cx';
import { accentOf, stageOf } from '../../shared/utils/stages';
import { pill, wash } from '../../shared/utils/surfaces';
import { send } from '../../shared/utils/vscodeApi';
import type { BoardTicket } from '../types/board';
import { DRAG_TYPE } from '../utils/drag';
import { CardMoveMenu } from './CardMoveMenu';

type Props = { t: BoardTicket; theme: Theme; statuses: string[] };

export function BoardCard({ t, theme, statuses }: Props) {
  const a = t.agent;
  const accent = accentOf(a, t.status);
  const needs = needsYou(a);
  const [hover, setHover] = useState(false);
  const stage = a?.kind === 'finished' ? undefined : stageOf(a?.stage);

  return (
    <article
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ key: t.key, from: t.status }));
        e.dataTransfer.effectAllowed = 'move';
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={cx(
        'group relative grid cursor-grab gap-1.5 rounded-xl border border-ink/[0.07] bg-ink/[0.025] p-3 transition-[background,border-color,box-shadow] duration-300 ease-soft active:cursor-grabbing',
        'hc:border-[var(--vscode-contrastBorder)] light:bg-base light:shadow-[0_1px_2px_rgb(12_29_73/0.06)]'
      )}
      style={
        needs ? wash(accent, theme, 'open', true) : hover ? wash(accent, theme, 'hover') : undefined
      }
    >
      <div className="flex items-center gap-2">
        <Orb agent={a} accent={accent} theme={theme} className="shrink-0" />
        <span className="text-[11.5px] font-medium text-muted tabular-nums">{t.key}</span>
        <span className="ml-auto text-[11px] text-muted tabular-nums">
          {t.points == null ? 'No points' : `${t.points} pts`}
        </span>
        <CardMoveMenu t={t} statuses={statuses} />
      </div>

      <LinkButton
        onPress={() => send({ type: 'openTicket', key: t.key })}
        className="text-[13px] leading-snug [overflow-wrap:anywhere] text-soft hover:text-ink"
      >
        {t.summary}
      </LinkButton>
      {needs && a && <AgentAsk agent={a} theme={theme} />}
      {(stage || t.pendingMove) && (
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {stage && (
            <span
              className="inline-flex items-center gap-1 rounded-md border px-1.5 py-px text-[11px]"
              style={pill(stage.accent, theme)}
            >
              <Icon path={stage.icon} size={12} />
              {stage.label}
              {a?.kind === 'running' && a.progress ? ` · ${progressText(a.progress)}` : ''}
            </span>
          )}
          {t.pendingMove && (
            <span className="inline-flex items-center rounded-md border border-ink/15 px-1.5 py-px text-[11px] text-muted">
              Moved on this board only
            </span>
          )}
        </div>
      )}
    </article>
  );
}
