import { useCallback, useRef, useState } from 'react';
import { Board } from '../../board/components/Board';
import { Queue } from '../../queue/components/Queue';
import { Splitter } from '../../queue/components/Splitter';
import { isGroupOpen, NEEDS_YOU_GROUP } from '../../queue/utils/groups';
import { useHostMessages } from '../../shared/hooks/useHostMessages';
import { usePersisted } from '../../shared/hooks/usePersisted';
import { useTheme } from '../../shared/hooks/useTheme';
import type { Detail, HostMsg, Snapshot } from '../../shared/types/host';
import type { StageId } from '../../shared/types/stage';
import { cx } from '../../shared/utils/cx';
import { PALETTE } from '../../shared/utils/palette';
import { accentOf } from '../../shared/utils/stages';
import { send } from '../../shared/utils/vscodeApi';
import { TicketPane } from '../../ticket/components/TicketPane';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { useNarrow } from '../hooks/useNarrow';
import { useTitleFocus } from '../hooks/useTitleFocus';
import { ambientGlow } from '../utils/glow';
import { BOARD, SIDEBAR } from '../utils/mode';
import { SprintHeader } from './SprintHeader';

export function App() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [offline, setOffline] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [selected, setSelected] = usePersisted<string | null>('selected', null);
  const [width, setWidth] = usePersisted('queueWidth', 340);
  const [tabs, setTabs] = usePersisted<Record<string, StageId>>('tabs', {});
  const [drafts, setDrafts] = usePersisted<Record<string, string>>('drafts', {});
  const [collapsed, setCollapsed] = usePersisted<Record<string, boolean>>('collapsed', {});
  const [showQueue, setShowQueue] = useState(true);
  const [page, setPage] = useState(false);
  const narrow = useNarrow() && !SIDEBAR;
  const theme = useTheme();
  const timer = useRef<number>(undefined);
  const picked = useRef(false);
  const focusTitle = useTitleFocus(detail);

  const keys =
    data?.groups.flatMap((g) =>
      isGroupOpen(collapsed, g.group) ? g.tickets.map((t) => t.key) : []
    ) ?? [];
  const select = useCallback(
    (k: string) => {
      setSelected(k);
      if (SIDEBAR) {
        return;
      }
      setDetail((d) => (d?.ticket.key === k ? d : null));
      clearTimeout(timer.current);
      timer.current = window.setTimeout(() => send({ type: 'select', key: k }), 120);
    },
    [setSelected]
  );
  const open = (k: string) => {
    if (SIDEBAR) {
      return send({ type: 'openTicket', key: k });
    }
    select(k);
    setPage(true);
    focusTitle(k);
  };

  useHostMessages((m: HostMsg) => {
    if (m.type === 'data') {
      setData(m);
      setOffline(false);
      if (!SIDEBAR && !BOARD && !picked.current) {
        picked.current = true;
        const all = m.groups.flatMap((g) => g.tickets.map((t) => t.key));
        const k = selected && all.includes(selected) ? selected : all[0];
        if (k) {
          select(k);
        }
      }
    }
    if (m.type === 'warn') {
      setOffline(true);
    }
    if (m.type === 'ticket') {
      setDetail((d) => (m.ticket.key === (selected ?? '') ? m : d));
    }
    if (m.type === 'select') {
      select(m.key);
      setPage(true);
    }
    if (m.type === 'layout') {
      setShowQueue(!!m.queue);
    }
    if (m.type === 'current' && SIDEBAR) {
      setSelected(m.key);
    }
  });

  useKeyboardShortcuts({
    keys,
    selected,
    select,
    detail,
    narrow,
    setPage,
    setTab: (key, tab) => setTabs((t) => ({ ...t, [key]: tab }))
  });

  const needsN = data?.groups.find((g) => g.group === NEEDS_YOU_GROUP)?.tickets.length ?? 0;
  const selT = data?.groups.flatMap((g) => g.tickets).find((t) => t.key === selected);
  const glowHex = PALETTE[accentOf(selT?.agent, selT?.status)].hex;
  const header = <SprintHeader data={data} offline={offline} needsN={needsN} theme={theme} />;

  if (SIDEBAR) {
    return (
      <main className="h-full">
        <h1 className="sr-only">Agent Ticket Board</h1>
        <Queue
          data={data}
          selected={selected}
          onSelect={select}
          onOpen={open}
          sidebar
          header={header}
          theme={theme}
          collapsed={collapsed}
          setCollapsed={setCollapsed}
        />
      </main>
    );
  }
  if (BOARD) {
    return <Board data={data} theme={theme} />;
  }
  // Ticket only: the sidebar queue is on screen, so the editor tab shows no second queue.
  const solo = !showQueue;
  const single = narrow || solo;

  return (
    <main
      className={cx('grid h-screen', single && 'grid-cols-1')}
      style={single ? undefined : { gridTemplateColumns: `${width}px 0 minmax(0,1fr)` }}
    >
      <h1 className="sr-only">Agent Ticket Board</h1>
      {!solo && (
        <div
          className={cx(
            'min-h-0 min-w-0 bg-ink/[0.012] light:bg-base/60',
            narrow && page && 'hidden'
          )}
        >
          <Queue
            data={data}
            selected={selected}
            onSelect={select}
            onOpen={open}
            sidebar={false}
            openOnPress={narrow}
            header={header}
            theme={theme}
            collapsed={collapsed}
            setCollapsed={setCollapsed}
          />
        </div>
      )}
      {!single && <Splitter width={width} setWidth={setWidth} />}
      <section
        aria-label="Selected ticket"
        className={cx('relative min-w-0 overflow-y-auto', narrow && !solo && !page && 'hidden')}
        style={theme === 'dark' ? ambientGlow(glowHex) : undefined}
      >
        {selected ? (
          <TicketPane
            d={detail?.ticket.key === selected ? detail : null}
            tab={tabs[selected]}
            setTab={(t) => setTabs((x) => ({ ...x, [selected]: t }))}
            draft={drafts[selected] ?? ''}
            setDraft={(s) => setDrafts((x) => ({ ...x, [selected]: s }))}
            onBack={narrow && !solo ? () => setPage(false) : undefined}
            theme={theme}
          />
        ) : (
          <p className="p-6 text-muted">Select a ticket in the sidebar.</p>
        )}
      </section>
    </main>
  );
}
