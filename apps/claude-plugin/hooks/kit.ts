import type { EngineInterface, RenderElement } from 'claude-code';
import { accentOf, PALETTE, type Accent, type TrackerState } from './look.gen';
import { isOpen, store } from './store';
import type { Agent } from './types';

export type Els = ReturnType<EngineInterface['ui']['resolve']>;

/** What every view of the pane draws with. */
export type Ctx = { els: Els; redraw: () => void };

// Longer than any pane: `wrap: 'clip'` cuts it at the row width, so the rule spans the row exactly.
const RULE = '─'.repeat(400);

export const hex = (a: Accent) => PALETTE[a].hex;

// The title row of each section, and the rules between parts of a page. A page is a flat list of
// rows, so `collapsible` finds where each section starts and ends by these marks.
const TITLES = new WeakMap<object, string>();
const BREAKS = new WeakSet<object>();

/** The rows of a page without the rows of the sections that the developer collapsed. */
export function collapsible(rows: RenderElement[]): RenderElement[] {
  const out: RenderElement[] = [];
  let skipping = false;
  for (const row of rows) {
    const id = TITLES.get(row as object);
    if (id !== undefined) {
      out.push(row);
      skipping = !isOpen('section:' + id);
      continue;
    }
    if (BREAKS.has(row as object)) {
      skipping = false;
    }
    if (!skipping) {
      out.push(row);
    }
  }
  return out;
}

/** The accent of a ticket as a color: the shared rule from core, through the generated copy. */
export const accentHex = (a: Agent, state?: TrackerState) => hex(accentOf(a, state));

export const needsYou = (a: Agent) => !!a && (a.kind === 'problem' || a.kind === 'decision');

export function kit(ctx: Ctx) {
  const { Box, Text, Button } = ctx.els;
  return {
    rule: () => {
      const row = Text({ dimColor: true, wrap: 'clip', children: [RULE] });
      BREAKS.add(row as object);
      return row;
    },
    dim: (text: string) => Text({ dimColor: true, wrap: 'wrap', children: [text] }),
    /** A title that is not a toggle: for a box that sits inside a row, such as a run. */
    heading: (key: string, title: string, color: string, aside?: string) =>
      Box({
        key,
        flexDirection: 'row',
        columnGap: 1,
        children: [
          Text({ color, children: ['◆'] }),
          Text({ weight: 'semibold', children: [title] }),
          ...(aside ? [Text({ dimColor: true, children: [aside] })] : [])
        ]
      }),
    /** The title row of a section. Its button collapses and expands the rows under it. */
    sectionTitle: (key: string, title: string, color: string, aside?: string) => {
      const open = isOpen('section:' + key);
      const row = Box({
        key,
        flexDirection: 'row',
        columnGap: 1,
        children: [
          Text({ color, children: ['◆'] }),
          Button({
            key: 'toggle-' + key,
            plain: true,
            label: (open ? '▾ ' : '▸ ') + title,
            onPress: () => {
              store.collapsed['section:' + key] = open;
              ctx.redraw();
            }
          }),
          ...(aside ? [Text({ dimColor: true, children: [aside] })] : [])
        ]
      });
      TITLES.set(row as object, key);
      return row;
    }
  };
}

/** A stage action that is not built yet: say so, start nothing. */
export function notBuilt($: EngineInterface, key: string, label: string) {
  $.ui.toast(`${key}: ${label}. Not built yet: nothing started.`);
}
