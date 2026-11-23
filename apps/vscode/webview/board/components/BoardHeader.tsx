import { mdiFormatListBulleted } from '@mdi/js';
import { Bullet } from '../../shared/components/Bullet';
import { Button } from '../../shared/components/Button';
import { Icon } from '../../shared/components/Icon';
import { NeedsYouCount } from '../../shared/components/NeedsYouCount';
import { RefreshButton } from '../../shared/components/RefreshButton';
import type { Snapshot } from '../../shared/types/host';
import type { Theme } from '../../shared/types/theme';
import { send } from '../../shared/utils/vscodeApi';

type Props = { data: Snapshot | null; total: number; needsN: number; theme: Theme };

export function BoardHeader({ data, total, needsN, theme }: Props) {
  return (
    <div className="flex items-start gap-1 px-5 pt-4 pb-3">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <h2 className="m-0 text-[20px] leading-tight font-semibold tracking-tight text-ink">
          Board
        </h2>
        <span
          className="flex flex-wrap items-center gap-x-1.5 text-[12px] text-muted"
          aria-live="polite"
        >
          {!data ? (
            'Loading…'
          ) : (
            <>
              <span>
                <span className="font-medium text-soft tabular-nums">{total}</span> tickets
              </span>
              <NeedsYouCount count={needsN} theme={theme} />
              <Bullet />
              <span>Drag a card, or use its menu, to change its Jira status</span>
            </>
          )}
        </span>
      </div>

      <Button variant="ghost" className="h-7 px-2" onPress={() => send({ type: 'openTicket' })}>
        <Icon path={mdiFormatListBulleted} size={15} />
        List
      </Button>
      <RefreshButton updating={data?.updating} label="Refresh from Jira" />
    </div>
  );
}
