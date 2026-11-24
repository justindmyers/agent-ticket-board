import { mdiCogOutline, mdiViewColumnOutline } from '@mdi/js';
import { Bullet } from '../../shared/components/Bullet';
import { Button } from '../../shared/components/Button';
import { Icon } from '../../shared/components/Icon';
import { Kbd } from '../../shared/components/Kbd';
import { NeedsYouCount } from '../../shared/components/NeedsYouCount';
import { RefreshButton } from '../../shared/components/RefreshButton';
import type { Snapshot } from '../../shared/types/host';
import type { Theme } from '../../shared/types/theme';
import { send } from '../../shared/utils/vscodeApi';
import { SIDEBAR } from '../utils/mode';
import { clockTime } from '../utils/time';

type Props = { data: Snapshot | null; offline: boolean; needsN: number; theme: Theme };

export function SprintHeader({ data, offline, needsN, theme }: Props) {
  const total = data?.groups.reduce((s, g) => s + g.tickets.length, 0) ?? 0;

  return (
    <div className="flex items-start gap-1 px-4 pt-4 pb-3">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <h2 className="m-0 text-[20px] leading-tight font-semibold tracking-tight text-ink">
          My sprint
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
              {(data.updating || offline) && (
                <>
                  <Bullet />
                  <span>{data.updating ? 'Updating' : `Offline, from ${clockTime(data.at)}`}</span>
                </>
              )}
            </>
          )}
        </span>
      </div>

      <Button variant="ghost" className="h-7 px-2" onPress={() => send({ type: 'openBoard' })}>
        <Icon path={mdiViewColumnOutline} size={15} />
        Board<Kbd>B</Kbd>
      </Button>
      {!SIDEBAR && (
        <Button
          variant="ghost"
          className="size-7 justify-center px-0"
          aria-label="Settings"
          onPress={() => send({ type: 'openSettings' })}
        >
          <Icon path={mdiCogOutline} size={15} />
        </Button>
      )}
      <RefreshButton
        updating={data?.updating}
        label={`Refresh from Jira. Last refresh ${clockTime(data?.at)}`}
      />
    </div>
  );
}
