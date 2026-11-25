import { mdiArrowLeft, mdiChevronRight, mdiCommentTextOutline, mdiOpenInNew } from '@mdi/js';
import { Button } from '../../shared/components/Button';
import { Icon } from '../../shared/components/Icon';
import type { Detail } from '../../shared/types/host';
import type { Theme } from '../../shared/types/theme';
import { accentOf, runActive } from '@agent-ticket-board/core/look';
import { type stageOf } from '../../shared/utils/stages';
import { ink } from '../../shared/utils/surfaces';
import type { Act } from '../types/ticket';
import { TicketMoreMenu } from './TicketMoreMenu';

type Props = {
  d: Detail;
  stage: ReturnType<typeof stageOf> | null;
  act: Act;
  onBack?: () => void;
  theme: Theme;
};

export function TicketNav({ d, stage, act, onBack, theme }: Props) {
  const f = d.flow;
  const plain = f ? 'neutral' : accentOf(null, d.tracker?.state);
  const stageColor = stage
    ? ink(stage.accent, theme)
    : f?.closed
      ? ink('green', theme)
      : plain === 'neutral'
        ? undefined
        : ink(plain, theme);
  const label = stage ? stage.label : f?.closed ? 'Finished' : (d.tracker?.label ?? 'Not started');

  return (
    <nav aria-label="Where it is" className="flex min-w-0 items-center gap-1 text-xs text-muted">
      {onBack && (
        <Button
          variant="ghost"
          className="-ml-1 size-7 justify-center px-0"
          aria-label="Back to queue"
          onPress={onBack}
        >
          <Icon path={mdiArrowLeft} size={16} />
        </Button>
      )}
      <span id="ttl-key" className="font-medium text-soft tabular-nums">
        {d.ticket.key}
      </span>
      <Icon path={mdiChevronRight} size={14} className="text-muted" />
      <span style={{ color: stageColor }}>{label}</span>
      {!d.fresh && <span className="ml-2 text-muted">Updating…</span>}
      <div className="ml-auto flex items-center gap-0.5">
        <Button variant="ghost" className="h-7 px-2" onPress={() => act('openJira')}>
          Jira
          <Icon path={mdiOpenInNew} size={13} />
        </Button>
        <Button
          variant="ghost"
          className="h-7 px-2"
          onPress={() => act('openChat')}
          isDisabled={!f || runActive(f)}
          aria-label={
            f && runActive(f)
              ? 'Continue in a Claude Code chat: stop the agent run first'
              : 'Continue in a Claude Code chat'
          }
        >
          <Icon path={mdiCommentTextOutline} size={14} />
          Chat
        </Button>
        <TicketMoreMenu act={act} />
      </div>
    </nav>
  );
}
