import { ListBoxItem } from 'react-aria-components';
import { AgentAsk } from '../../shared/components/AgentAsk';
import { Orb } from '../../shared/components/Orb';
import type { QueueTicket } from '../../shared/types/host';
import type { Theme } from '../../shared/types/theme';
import { needsYou, progressText } from '../../shared/utils/agent';
import { cx } from '../../shared/utils/cx';
import { accentOf } from '../../shared/utils/stages';
import { wash } from '../../shared/utils/surfaces';

type Props = { t: QueueTicket; current: boolean; theme: Theme };

const metaOf = (t: QueueTicket) =>
  t.agent?.kind === 'running' && t.agent.progress
    ? `Step ${progressText(t.agent.progress)}`
    : t.points == null
      ? 'No points'
      : `${t.points} pts`;

export function QueueRow({ t, current, theme }: Props) {
  const a = t.agent;
  const accent = accentOf(a, t.status);
  const needs = needsYou(a);

  return (
    <ListBoxItem
      id={t.key}
      textValue={`${t.key} ${t.summary}`}
      aria-current={current ? 'true' : undefined}
      style={({ isHovered, isSelected }) =>
        wash(accent, theme, current || isSelected ? 'open' : isHovered ? 'hover' : 'rest', needs)
      }
      className={({ isFocusVisible }) =>
        cx(
          'relative mb-1 grid cursor-pointer grid-cols-[10px_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-1 rounded-xl border border-transparent px-3 py-2.5 outline-none',
          'transition-[background,border-color,box-shadow] duration-300 ease-soft',
          isFocusVisible && 'ring-2 ring-ink/40 hc:ring-[var(--vscode-focusBorder)]'
        )
      }
    >
      <Orb agent={a} accent={accent} theme={theme} />
      <span className="text-[11.5px] font-medium text-muted tabular-nums">{t.key}</span>
      <span className="text-[11px] whitespace-nowrap text-muted tabular-nums">{metaOf(t)}</span>
      <span
        className={cx(
          'col-start-2 col-end-4 text-[13px] leading-snug [overflow-wrap:anywhere]',
          current ? 'font-medium text-ink/95' : 'text-soft'
        )}
      >
        {t.summary}
      </span>
      {needs && a && (
        <AgentAsk
          agent={a}
          theme={theme}
          className="col-start-2 col-end-4 flex items-start gap-1.5"
        />
      )}
      {!needs && a && (
        <span className="sr-only">
          {a.kind === 'running' ? 'Agent running' : a.kind === 'finished' ? a.closed : a.stageLabel}
        </span>
      )}
    </ListBoxItem>
  );
}
