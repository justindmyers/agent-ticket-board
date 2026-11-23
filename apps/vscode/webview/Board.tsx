import { useState } from 'react';
import { Menu, MenuItem, MenuTrigger, Popover } from 'react-aria-components';
import {
  mdiChevronLeft,
  mdiChevronRight,
  mdiDotsHorizontal,
  mdiFormatListBulleted,
  mdiRefresh
} from '@mdi/js';
import { Button, Icon, cx } from './ui';
import { accentOf, stageOf } from './stages';
import { PALETTE, ink, orb, pill, wash, type Theme } from './surfaces';
import { send, usePersisted, type QueueTicket, type Snapshot } from './host';

// Kanban board: one column per Jira status. A drag (or "Move to" in a card's menu) asks the host
// to run the tracker transition after a confirmation; the agent never moves a ticket.
const COLUMNS = ['To Do', 'In Progress', 'Code Review', 'Verifying', 'Blocked', 'Done'];
const STATUS_DOT: Record<string, string> = {
  'To Do': PALETTE.neutral.hex,
  'In Progress': PALETTE.blue.hex,
  'Code Review': PALETTE.green.hex,
  Verifying: PALETTE.aqua.hex,
  Blocked: PALETTE.red.hex,
  Done: PALETTE.green.hex
};
type T = QueueTicket & { pendingMove?: boolean };

function Card({ t, theme, statuses }: { t: T; theme: Theme; statuses: string[] }) {
  const a = t.agent;
  const accent = accentOf(a, t.status);
  const needs = a && (a.kind === 'problem' || a.kind === 'decision');
  const [hover, setHover] = useState(false);
  const stage = a?.kind === 'finished' ? undefined : stageOf(a?.stage);
  return (
    <article
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', JSON.stringify({ key: t.key, from: t.status }));
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
        <span
          aria-hidden="true"
          className={cx(
            'size-2.5 shrink-0 rounded-full',
            !a && 'opacity-50',
            a?.kind === 'running' && 'animate-breathe'
          )}
          style={orb(accent, theme)}
        />
        <span className="text-[11.5px] font-medium text-muted tabular-nums">{t.key}</span>
        <span className="ml-auto text-[11px] text-muted tabular-nums">
          {t.points == null ? 'No points' : `${t.points} pts`}
        </span>
        <MenuTrigger>
          <Button
            variant="ghost"
            className="-mr-1.5 size-6 justify-center px-0 opacity-0 group-hover:opacity-100 data-focus-visible:opacity-100 data-pressed:opacity-100"
            aria-label={`Move ${t.key}`}
          >
            <Icon path={mdiDotsHorizontal} size={15} />
          </Button>
          <Popover
            placement="bottom end"
            offset={4}
            className="min-w-[180px] rounded-xl border border-ink/10 bg-base/95 p-1 shadow-[0_16px_40px_rgb(0_0_0/0.45)] backdrop-blur-xl outline-none"
          >
            <Menu
              aria-label={`Move ${t.key} to`}
              className="outline-none"
              onAction={(to) => send({ type: 'move', key: t.key, from: t.status, to: String(to) })}
            >
              {statuses
                .filter((s) => s !== t.status)
                .map((s) => (
                  <MenuItem
                    key={s}
                    id={s}
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12.5px] text-soft outline-none data-[focused]:bg-ink/[0.07] data-[focused]:text-ink"
                  >
                    <span
                      aria-hidden="true"
                      className="size-1.5 rounded-full"
                      style={{ background: STATUS_DOT[s] ?? PALETTE.neutral.hex }}
                    />
                    Move to {s}
                  </MenuItem>
                ))}
            </Menu>
          </Popover>
        </MenuTrigger>
      </div>
      <button
        onClick={() => send({ type: 'openTicket', key: t.key })}
        className="cursor-pointer text-left text-[13px] leading-snug [overflow-wrap:anywhere] text-soft outline-none hover:text-ink focus-visible:rounded focus-visible:ring-2 focus-visible:ring-ink/40"
      >
        {t.summary}
      </button>
      {needs && (
        <span
          className="text-[12px] leading-snug"
          style={{ color: a!.kind === 'problem' ? ink('red', theme) : ink('violet', theme) }}
        >
          <span className="sr-only">
            {a!.kind === 'problem' ? 'Problem: ' : 'Agent needs you: '}
          </span>
          {a!.ask}
        </span>
      )}
      {(stage || t.pendingMove) && (
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {stage && (
            <span
              className="inline-flex items-center gap-1 rounded-md border px-1.5 py-px text-[11px]"
              style={pill(stage.accent, theme)}
            >
              <Icon path={stage.icon} size={12} />
              {stage.label}
              {a?.kind === 'running' && a.progress ? ` · ${a.progress.replace('/', ' of ')}` : ''}
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

export function Board({ data, theme }: { data: Snapshot | null; theme: Theme }) {
  const [collapsed, setCollapsed] = usePersisted<Record<string, boolean>>('boardCollapsed', {
    Done: true
  });
  const [over, setOver] = useState<string | null>(null);
  const tickets = (data?.groups.flatMap((g) => g.tickets) ?? []) as T[];
  const statuses = [
    ...COLUMNS,
    ...new Set(tickets.map((t) => t.status).filter((s) => !COLUMNS.includes(s)))
  ];
  const needsN = tickets.filter(
    (t) => t.agent && (t.agent.kind === 'problem' || t.agent.kind === 'decision')
  ).length;
  return (
    <main className="flex h-screen min-w-0 flex-col">
      <h1 className="sr-only">Agent Ticket Board: board</h1>
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
                  <span className="font-medium text-soft tabular-nums">{tickets.length}</span>{' '}
                  tickets
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
                <span aria-hidden="true" className="text-ink/25">
                  •
                </span>
                <span>Drag a card, or use its menu, to change its Jira status</span>
              </>
            )}
          </span>
        </div>
        <Button variant="ghost" className="h-7 px-2" onPress={() => send({ type: 'openTicket' })}>
          <Icon path={mdiFormatListBulleted} size={15} />
          List
        </Button>
        <Button
          variant="ghost"
          className="size-7 justify-center px-0"
          aria-label="Refresh from Jira"
          onPress={() => send({ type: 'refresh' })}
        >
          <Icon
            path={mdiRefresh}
            size={15}
            className={data?.updating ? 'animate-spin [animation-duration:1.6s]' : undefined}
          />
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto px-5 pb-5">
        {statuses.map((s) => {
          const items = tickets.filter((t) => t.status === s);
          const closed = !!collapsed[s];
          const toggle = () => setCollapsed((c) => ({ ...c, [s]: !closed }));
          return (
            <section
              key={s}
              aria-label={`${s}, ${items.length} tickets`}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(s);
              }}
              onDragLeave={() => setOver((o) => (o === s ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                try {
                  const d = JSON.parse(e.dataTransfer.getData('text/plain'));
                  if (d.from !== s) {
                    send({ type: 'move', key: d.key, from: d.from, to: s });
                  }
                } catch {
                  /* not a card */
                }
              }}
              className={cx(
                'flex min-h-0 shrink-0 flex-col rounded-2xl border transition-colors duration-200',
                closed ? 'w-11' : 'min-w-[250px] flex-1 basis-0',
                over === s
                  ? 'border-ink/30 bg-ink/[0.05]'
                  : 'border-ink/[0.06] bg-ink/[0.015] light:bg-ink/[0.025]',
                'hc:border-[var(--vscode-contrastBorder)]'
              )}
            >
              <h3 className="m-0">
                <Button
                  variant="ghost"
                  onPress={toggle}
                  aria-expanded={!closed}
                  className={cx(
                    'w-full gap-2 rounded-t-2xl rounded-b-none text-[11px] font-medium tracking-[0.08em] uppercase',
                    closed
                      ? 'h-auto flex-col py-3 [writing-mode:vertical-rl]'
                      : 'h-10 justify-start px-3'
                  )}
                >
                  <span
                    aria-hidden="true"
                    className="size-1.5 shrink-0 rounded-full"
                    style={{ background: STATUS_DOT[s] ?? PALETTE.neutral.hex }}
                  />
                  <span className={cx('text-soft', !closed && 'flex-1 text-left')}>{s}</span>
                  <span className="text-muted tabular-nums">{items.length}</span>
                  {!closed && <Icon path={mdiChevronLeft} size={14} className="text-muted" />}
                  {closed && (
                    <Icon path={mdiChevronRight} size={14} className="rotate-90 text-muted" />
                  )}
                </Button>
              </h3>
              {!closed && (
                <div className="grid min-h-0 content-start gap-2 overflow-y-auto border-t border-ink/[0.06] p-2.5">
                  {!data ? (
                    Array.from({ length: 2 }, (_, i) => (
                      <div key={i} className="h-20 animate-breathe rounded-xl bg-ink/[0.05]" />
                    ))
                  ) : items.length ? (
                    items.map((t) => <Card key={t.key} t={t} theme={theme} statuses={statuses} />)
                  ) : (
                    <p className="m-0 px-1 py-3 text-center text-[12px] text-muted">Nothing here</p>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </main>
  );
}
