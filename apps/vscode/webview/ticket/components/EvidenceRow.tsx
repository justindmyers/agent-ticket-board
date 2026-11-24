import { shotGroups } from '@agent-ticket-board/core/look';
import { Pill } from '../../shared/components/Pill';
import type { Evidence } from '../../shared/types/host';
import type { Theme } from '../../shared/types/theme';
import type { Act } from '../types/ticket';
import { ShotSet } from './ShotSet';
import { TicketRow } from './TicketRow';

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
          <Pill accent={ev.ok ? 'green' : 'red'} theme={theme}>
            {ev.ok ? 'Passes' : 'Does not pass'}
          </Pill>
        ) : (
          <span className="text-[11px] text-muted">Not tested</span>
        )
      }
      sub={<span>{req.check}</span>}
    >
      {req.text}
      {ev?.seen && <span className="mt-1 block text-xs text-soft">{ev.seen}</span>}
      {ev?.note && <span className="mt-1 block text-xs text-muted">{ev.note}</span>}
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
