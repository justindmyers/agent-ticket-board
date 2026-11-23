import { useState } from 'react';
import {
  Disclosure,
  DisclosurePanel,
  Heading,
  ListBox,
  ListBoxItem,
  type Key
} from 'react-aria-components';
import { mdiChevronDown, mdiChevronRight } from '@mdi/js';
import { Button, Icon, cx } from './ui';
import { accentOf } from './stages';
import { PALETTE, ink, orb, wash, type Theme } from './surfaces';
import type { Group, QueueTicket, Snapshot } from './host';

const COLLAPSED_BY_DEFAULT = new Set(['Done']);
const GROUP_DOT: Record<string, string> = {
  'Needs you': PALETTE.violet.hex,
  Running: PALETTE.blue.hex
};

function Row({ t, current, theme }: { t: QueueTicket; current: boolean; theme: Theme }) {
  const a = t.agent;
  const accent = accentOf(a, t.status);
  const needs = a && (a.kind === 'problem' || a.kind === 'decision');
  const meta =
    a?.kind === 'running' && a.progress
      ? `Step ${a.progress.replace('/', ' of ')}`
      : t.points == null
        ? 'No points'
        : `${t.points} pts`;
  return (
    <ListBoxItem
      id={t.key}
      textValue={`${t.key} ${t.summary}`}
      aria-current={current ? 'true' : undefined}
      style={({ isHovered, isSelected }) =>
        wash(accent, theme, current || isSelected ? 'open' : isHovered ? 'hover' : 'rest', !!needs)
      }
      className={({ isFocusVisible }) =>
        cx(
          'relative mb-1 grid cursor-pointer grid-cols-[10px_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-1 rounded-xl border border-transparent px-3 py-2.5 outline-none',
          'transition-[background,border-color,box-shadow] duration-300 ease-soft',
          isFocusVisible && 'ring-2 ring-ink/40 hc:ring-[var(--vscode-focusBorder)]'
        )
      }
    >
      <span
        aria-hidden="true"
        className={cx(
          'size-2.5 rounded-full',
          !a && 'opacity-50',
          a?.kind === 'running' && 'animate-breathe'
        )}
        style={orb(accent, theme)}
      />
      <span className="text-[11.5px] font-medium text-muted tabular-nums">{t.key}</span>
      <span className="text-[11px] whitespace-nowrap text-muted tabular-nums">{meta}</span>
      <span
        className={cx(
          'col-start-2 col-end-4 text-[13px] leading-snug [overflow-wrap:anywhere]',
          current ? 'font-medium text-ink/95' : 'text-soft'
        )}
      >
        {t.summary}
      </span>
      {needs && (
        <span
          className="col-start-2 col-end-4 flex items-start gap-1.5 text-[12px] leading-snug"
          style={{ color: a!.kind === 'problem' ? ink('red', theme) : ink('violet', theme) }}
        >
          <span className="sr-only">
            {a!.kind === 'problem' ? 'Problem: ' : 'Agent needs you: '}
          </span>
          {a!.ask}
        </span>
      )}
      {!needs && a && (
        <span className="sr-only">
          {a.kind === 'running' ? 'Agent running' : a.kind === 'finished' ? a.closed : a.stageLabel}
        </span>
      )}
    </ListBoxItem>
  );
}

export const COLLAPSED_BY_DEFAULT_GROUPS = COLLAPSED_BY_DEFAULT;

/** One collapsible list per group, with a divider between groups. j/k (in main.tsx) moves across groups. */
export function Queue({
  data,
  selected,
  onSelect,
  onOpen,
  sidebar,
  openOnPress = false,
  header,
  theme,
  collapsed,
  setCollapsed
}: {
  data: Snapshot | null;
  selected: string | null;
  onSelect: (k: string) => void;
  onOpen: (k: string) => void;
  sidebar: boolean;
  openOnPress?: boolean;
  header: React.ReactNode;
  theme: Theme;
  collapsed: Record<string, boolean>;
  setCollapsed: (f: (c: Record<string, boolean>) => Record<string, boolean>) => void;
}) {
  const groups = data?.groups ?? [];
  const isOpen = (g: string) => !(collapsed[g] ?? COLLAPSED_BY_DEFAULT.has(g));
  // Sidebar and narrow layouts: a press opens the ticket. Split layout: selection follows focus.
  const pressOpens = sidebar || openOnPress;
  const listProps = (g: Group) =>
    pressOpens
      ? { selectionMode: 'none' as const, onAction: (k: Key) => onOpen(String(k)) }
      : {
          selectionMode: 'single' as const,
          selectionBehavior: 'replace' as const,
          disallowEmptySelection: true,
          selectedKeys: selected && g.tickets.some((t) => t.key === selected) ? [selected] : [],
          onSelectionChange: (s: 'all' | Set<Key>) => {
            const k = s !== 'all' && [...s][0];
            if (k) {
              onSelect(String(k));
            }
          },
          onAction: (k: Key) => onOpen(String(k))
        };
  return (
    <div
      className="flex h-full min-h-0 min-w-0 flex-col"
      role="navigation"
      aria-label="Ticket queue"
    >
      {header}
      <div className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-5" data-queue>
        {!data ? (
          <Skeleton />
        ) : groups.length === 0 ? (
          <p className="p-3 text-muted">No tickets in the open sprint.</p>
        ) : (
          groups.map((g) => (
            <Disclosure
              key={g.group}
              isExpanded={isOpen(g.group)}
              onExpandedChange={(open) => setCollapsed((c) => ({ ...c, [g.group]: !open }))}
              className="border-t border-ink/[0.08] py-1.5 first:border-t-0 hc:border-[var(--vscode-contrastBorder)]"
            >
              <Heading className="m-0">
                <Button
                  slot="trigger"
                  variant="ghost"
                  className="h-8 w-full justify-start gap-2 rounded-lg px-2 text-[11px] font-medium tracking-[0.08em] uppercase"
                >
                  <Icon
                    path={isOpen(g.group) ? mdiChevronDown : mdiChevronRight}
                    size={14}
                    className="text-muted"
                  />
                  <span
                    aria-hidden="true"
                    className="size-1.5 shrink-0 rounded-full"
                    style={{
                      background:
                        GROUP_DOT[g.group] ?? 'color-mix(in srgb, var(--atb-ink) 30%, transparent)'
                    }}
                  />
                  <span
                    className={cx(
                      'min-w-0 flex-1 text-left',
                      g.group === 'Needs you' ? 'text-soft' : 'text-muted'
                    )}
                  >
                    {g.group}
                  </span>
                  <span className="text-muted tabular-nums">{g.tickets.length}</span>
                </Button>
              </Heading>
              <DisclosurePanel>
                <ListBox
                  aria-label={g.group}
                  className="pt-1 outline-none"
                  items={g.tickets}
                  dependencies={[selected, theme]}
                  {...listProps(g)}
                >
                  {(t) => <Row t={t} current={t.key === selected} theme={theme} />}
                </ListBox>
              </DisclosurePanel>
            </Disclosure>
          ))
        )}
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div aria-busy="true" aria-label="Loading tickets" className="grid gap-1 pt-2">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="grid gap-2 rounded-xl px-3 py-2.5">
          <span className="h-2.5 w-16 animate-breathe rounded bg-ink/[0.07]" />
          <span
            className="h-3 animate-breathe rounded bg-ink/[0.07]"
            style={{ width: `${45 + ((i * 37) % 45)}%` }}
          />
        </div>
      ))}
    </div>
  );
}

/** Drag to resize the queue, or focus the handle and use the arrow keys. */
export function Splitter({
  width,
  setWidth,
  min = 240,
  max = 600
}: {
  width: number;
  setWidth: (w: number) => void;
  min?: number;
  max?: number;
}) {
  const [drag, setDrag] = useState(false);
  const clamp = (w: number) => Math.max(min, Math.min(max, Math.round(w)));
  return (
    <div className="relative z-10 w-0">
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize ticket queue"
        aria-valuenow={width}
        aria-valuemin={min}
        aria-valuemax={max}
        tabIndex={0}
        className="group absolute inset-y-0 -left-1 w-2 cursor-col-resize outline-none"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          setDrag(true);
        }}
        onPointerMove={(e) => {
          if (drag) {
            setWidth(clamp(e.clientX));
          }
        }}
        onPointerUp={() => setDrag(false)}
        onDoubleClick={() => setWidth(360)}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 64 : 16;
          if (e.key === 'ArrowLeft') {
            e.preventDefault();
            setWidth(clamp(width - step));
          }
          if (e.key === 'ArrowRight') {
            e.preventDefault();
            setWidth(clamp(width + step));
          }
          if (e.key === 'Home') {
            e.preventDefault();
            setWidth(min);
          }
          if (e.key === 'End') {
            e.preventDefault();
            setWidth(max);
          }
        }}
      >
        <span
          className={cx(
            'absolute inset-y-0 left-[3.5px] w-px bg-ink/[0.07] transition-colors group-hover:bg-ink/30 group-focus-visible:bg-ink/50',
            drag && 'bg-ink/50'
          )}
        />
      </div>
    </div>
  );
}
