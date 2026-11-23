import { useState } from 'react';
import { usePersisted } from '../../shared/hooks/usePersisted';
import type { Snapshot } from '../../shared/types/host';
import type { Theme } from '../../shared/types/theme';
import { needsYou } from '../../shared/utils/agent';
import type { BoardTicket } from '../types/board';
import { boardStatuses } from '../utils/columns';
import { BoardColumn } from './BoardColumn';
import { BoardHeader } from './BoardHeader';

type Props = { data: Snapshot | null; theme: Theme };

export function Board({ data, theme }: Props) {
  const [collapsed, setCollapsed] = usePersisted<Record<string, boolean>>('boardCollapsed', {
    Done: true
  });
  const [over, setOver] = useState<string | null>(null);
  const tickets: BoardTicket[] = data?.groups.flatMap((g) => g.tickets) ?? [];
  const statuses = boardStatuses(tickets);
  const needsN = tickets.filter((t) => needsYou(t.agent)).length;

  return (
    <main className="flex h-screen min-w-0 flex-col">
      <h1 className="sr-only">Agent Ticket Board: board</h1>
      <BoardHeader data={data} total={tickets.length} needsN={needsN} theme={theme} />
      <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto px-5 pb-5">
        {statuses.map((s) => (
          <BoardColumn
            key={s}
            status={s}
            items={tickets.filter((t) => t.status === s)}
            loading={!data}
            closed={!!collapsed[s]}
            onToggle={() => setCollapsed((c) => ({ ...c, [s]: !c[s] }))}
            over={over === s}
            setOver={setOver}
            statuses={statuses}
            theme={theme}
          />
        ))}
      </div>
    </main>
  );
}
