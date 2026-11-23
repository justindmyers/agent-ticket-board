import { StrictMode, useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { Queue, Splitter, COLLAPSED_BY_DEFAULT_GROUPS } from './Queue';
import { Board } from './Board';
import { TicketPane, STAGES, type StageId } from './TicketPane';
import { Button, Icon, Kbd, cx } from './ui';
import { mdiRefresh, mdiViewColumnOutline } from '@mdi/js';
import { accentOf, stageOf } from './stages';
import { PALETTE, useTheme } from './surfaces';
import {
  send,
  useHostMessages,
  usePersisted,
  type Detail,
  type HostMsg,
  type Snapshot
} from './host';

const SIDEBAR = document.body.dataset.mode === 'sidebar';
const BOARD = document.body.dataset.mode === 'board';
const time = (iso?: string | null) => {
  const d = iso ? new Date(iso) : null;
  return d && !isNaN(+d) ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
};

function useNarrow() {
  const [n, setN] = useState(() => innerWidth < 640);
  useEffect(() => {
    const h = () => setN(innerWidth < 640);
    addEventListener('resize', h);
    return () => removeEventListener('resize', h);
  }, []);
  return n;
}

function App() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [offline, setOffline] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [selected, setSelected] = usePersisted<string | null>('selected', null);
  const [width, setWidth] = usePersisted('queueWidth', 340);
  const [tabs, setTabs] = usePersisted<Record<string, StageId>>('tabs', {});
  const [drafts, setDrafts] = usePersisted<Record<string, string>>('drafts', {});
  const [collapsed, setCollapsed] = usePersisted<Record<string, boolean>>('collapsed', {});
  // Editor tab: show its own queue only while the sidebar queue is hidden (the host says which).
  const [showQueue, setShowQueue] = useState(true);
  const [page, setPage] = useState(false);
  const narrow = useNarrow() && !SIDEBAR;
  const theme = useTheme();
  const timer = useRef<number>(undefined);
  const focusTitle = useRef(false);
  const detailRef = useRef(detail);
  detailRef.current = detail;
  // Enter on a row moves focus to the ticket title once that ticket has drawn.
  useEffect(() => {
    if (focusTitle.current && detail?.ticket.key === selected) {
      focusTitle.current = false;
      requestAnimationFrame(() => document.getElementById('ttl')?.focus());
    }
  }, [detail, selected]);

  const keys =
    data?.groups.flatMap((g) =>
      (collapsed[g.group] ?? COLLAPSED_BY_DEFAULT_GROUPS.has(g.group))
        ? []
        : g.tickets.map((t) => t.key)
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
    focusTitle.current = true;
    requestAnimationFrame(() => {
      if (document.getElementById('ttl') && detailRef.current?.ticket.key === k) {
        document.getElementById('ttl')!.focus();
        focusTitle.current = false;
      }
    });
  };

  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const picked = useRef(false);

  useHostMessages(
    useCallback(
      (m: HostMsg) => {
        if (m.type === 'data') {
          setData(m);
          setOffline(false);
          // First data: pick a ticket and load it.
          if (!SIDEBAR && !BOARD && !picked.current) {
            picked.current = true;
            const all = m.groups.flatMap((g) => g.tickets.map((t) => t.key));
            const k =
              selectedRef.current && all.includes(selectedRef.current)
                ? selectedRef.current
                : all[0];
            if (k) {
              select(k);
            }
          }
        }
        if (m.type === 'warn') {
          setOffline(true);
        }
        if (m.type === 'ticket') {
          setDetail((d) => (m.ticket.key === (selectedRef.current ?? '') ? m : d));
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
      },
      [select, setSelected]
    )
  );

  // Keyboard: j/k move, a acts, c comments, 1-4 stage tabs, b board, r refresh, Escape back to the queue.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      if (BOARD) {
        if (e.key === 'r' && !/TEXTAREA|INPUT/.test(el?.tagName ?? '')) {
          send({ type: 'refresh' });
        }
        return;
      }
      if (
        e.metaKey ||
        e.ctrlKey ||
        e.altKey ||
        /TEXTAREA|INPUT/.test(el?.tagName ?? '') ||
        el?.closest('[role=menu]')
      ) {
        return;
      }
      const focusRow = (k: string) =>
        requestAnimationFrame(() =>
          (
            document.querySelector(
              `[data-queue] [data-key="${CSS.escape(k)}"]`
            ) as HTMLElement | null
          )?.focus()
        );
      if (e.key === 'j' || e.key === 'k') {
        e.preventDefault();
        if (!keys.length) {
          return;
        }
        const i = Math.max(0, keys.indexOf(selected ?? ''));
        const k = keys[Math.max(0, Math.min(keys.length - 1, i + (e.key === 'j' ? 1 : -1)))];
        select(k);
        focusRow(k);
      } else if (e.key === 'a' && detail?.flow?.need) {
        e.preventDefault();
        const a = detail.flow.need.actions[0];
        if (a.id === 'comment') {
          document.getElementById('draft')?.focus();
        } else {
          send({ type: 'action', key: detail.ticket.key, id: a.id });
        }
      } else if (e.key === 'c' && !SIDEBAR) {
        e.preventDefault();
        if (narrow) {
          setPage(true);
        }
        setTimeout(() => document.getElementById('draft')?.focus(), 30);
      } else if (/^[1-4]$/.test(e.key) && detail) {
        e.preventDefault();
        setTabs((t) => ({ ...t, [detail.ticket.key]: STAGES[+e.key - 1].id }));
      } else if (e.key === 'b') {
        e.preventDefault();
        send({ type: 'openBoard' });
      } else if (e.key === 'r') {
        e.preventDefault();
        send({ type: 'refresh' });
      } else if (e.key === 'Escape' && !SIDEBAR) {
        e.preventDefault();
        setPage(false);
        if (selected) {
          focusRow(selected);
        }
      }
    };
    addEventListener('keydown', h);
    return () => removeEventListener('keydown', h);
  });

  const n = data?.groups.reduce((s, g) => s + g.tickets.length, 0) ?? 0;
  const needsN = data?.groups.find((g) => g.group === 'Needs you')?.tickets.length ?? 0;
  // Ambient light behind the page, in the accent of the selected ticket (as the product's scene light).
  const selT = data?.groups.flatMap((g) => g.tickets).find((t) => t.key === selected);
  const glowHex = PALETTE[accentOf(selT?.agent, selT?.status)].hex;
  void stageOf;
  const header = (
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
                <span className="font-medium text-soft tabular-nums">{n}</span> tickets
              </span>
              {needsN > 0 && (
                <>
                  <span aria-hidden="true" className="text-ink/25">
                    •
                  </span>
                  <span>
                    <span
                      className="font-medium tabular-nums"
                      style={{ color: theme === 'hc' ? undefined : 'var(--atb-agent)' }}
                    >
                      {needsN}
                    </span>{' '}
                    need you
                  </span>
                </>
              )}
              {(data.updating || offline) && (
                <>
                  <span aria-hidden="true" className="text-ink/25">
                    •
                  </span>
                  <span>{data.updating ? 'Updating' : `Offline, from ${time(data.at)}`}</span>
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
      <Button
        variant="ghost"
        className="size-7 justify-center px-0"
        aria-label={`Refresh from Jira. Last refresh ${time(data?.at)}`}
        onPress={() => send({ type: 'refresh' })}
      >
        <Icon
          path={mdiRefresh}
          size={15}
          className={data?.updating ? 'animate-spin [animation-duration:1.6s]' : undefined}
        />
      </Button>
    </div>
  );

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
  return (
    <main
      className={cx('grid h-screen', (narrow || solo) && 'grid-cols-1')}
      style={narrow || solo ? undefined : { gridTemplateColumns: `${width}px 0 minmax(0,1fr)` }}
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
      {!narrow && !solo && <Splitter width={width} setWidth={setWidth} />}
      <section
        aria-label="Selected ticket"
        className={cx('relative min-w-0 overflow-y-auto', narrow && !solo && !page && 'hidden')}
        style={
          theme === 'dark'
            ? {
                background: `radial-gradient(900px 520px at 85% -10%, ${glowHex}1c, transparent 60%), radial-gradient(700px 500px at 0% 110%, ${glowHex}0f, transparent 60%)`,
                transition: 'background 600ms'
              }
            : undefined
        }
      >
        {selected ? (
          <TicketPane
            d={detail?.ticket.key === selected ? detail : null}
            tab={selected ? tabs[selected] : undefined}
            setTab={(t) => selected && setTabs((x) => ({ ...x, [selected]: t }))}
            draft={selected ? (drafts[selected] ?? '') : ''}
            setDraft={(s) => selected && setDrafts((x) => ({ ...x, [selected]: s }))}
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
send({ type: 'ready' });
