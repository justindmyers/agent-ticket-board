import { shotGroups } from '@agent-ticket-board/core/look';
import { Pill } from '../../shared/components/Pill';
import type { Evidence } from '../../shared/types/host';
import type { Theme } from '../../shared/types/theme';
import type { Act } from '../types/ticket';
import { FailureBlock } from './FailureBlock';
import { ShotSet } from './ShotSet';
import { TicketRow } from './TicketRow';

const DATA_LABEL = { real: 'Real data', fake: 'Fake data', none: 'Test only' } as const;

type Props = {
  req: { id: string; text: string; check: string };
  ev: Evidence | undefined;
  act: Act;
  theme: Theme;
};

/** One requirement on the Testing tab: its result, what the agent saw, and its screenshots. */
export function EvidenceRow({ req, ev, act, theme }: Props) {
  return (
    <TicketRow
      state={ev?.ok ? 'done' : 'todo'}
      lead={req.id}
      theme={theme}
      end={
        ev ? (
          <span className="flex flex-col items-end gap-1">
            <Pill accent={ev.ok ? 'green' : 'red'} theme={theme}>
              {ev.ok ? 'Passes' : 'Does not pass'}
            </Pill>
            {ev.data && (
              <Pill
                accent={ev.data === 'fake' ? 'amber' : ev.data === 'real' ? 'blue' : 'neutral'}
                theme={theme}
              >
                {DATA_LABEL[ev.data]}
              </Pill>
            )}
          </span>
        ) : (
          <span className="text-[11px] text-muted">Not tested</span>
        )
      }
      sub={<span>{req.check}</span>}
    >
      {req.text}
      {ev && !ev.ok && <FailureBlock ev={ev} />}
      {ev?.seen && <span className="mt-1 block text-xs text-soft">{ev.seen}</span>}
      {ev?.note && ev.ok && <span className="mt-1 block text-xs text-muted">{ev.note}</span>}
      {ev?.test && <span className="mt-1 block font-mono text-[11.5px] text-muted">{ev.test}</span>}
      {shotGroups(ev?.shots ?? []).map((g, _i, all) => (
        <ShotSet
          key={g.set}
          reqId={req.id}
          set={g.set}
          shots={g.shots}
          named={all.length > 1}
          act={act}
        />
      ))}
    </TicketRow>
  );
}
