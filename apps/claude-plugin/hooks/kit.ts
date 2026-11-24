import type { EngineInterface } from 'claude-code';
import { accentOf, PALETTE, type Accent, type TrackerState } from './look.gen';
import type { Agent } from './types';

export type Els = ReturnType<EngineInterface['ui']['resolve']>;

/** What every view of the pane draws with. */
export type Ctx = { els: Els; redraw: () => void };

// Longer than any pane: `wrap: 'clip'` cuts it at the row width, so the rule spans the row exactly.
const RULE = '─'.repeat(400);

export const hex = (a: Accent) => PALETTE[a].hex;

/** The accent of a ticket as a color: the shared rule from core, through the generated copy. */
export const accentHex = (a: Agent, state?: TrackerState) => hex(accentOf(a, state));

export const needsYou = (a: Agent) => !!a && (a.kind === 'problem' || a.kind === 'decision');

export function kit({ els: { Box, Text } }: Ctx) {
  return {
    rule: () => Text({ dimColor: true, wrap: 'clip', children: [RULE] }),
    dim: (text: string) => Text({ dimColor: true, wrap: 'wrap', children: [text] }),
    sectionTitle: (key: string, title: string, color: string, aside?: string) =>
      Box({
        key,
        flexDirection: 'row',
        columnGap: 1,
        children: [
          Text({ color, children: ['◆'] }),
          Text({ weight: 'semibold', children: [title] }),
          ...(aside ? [Text({ dimColor: true, children: [aside] })] : [])
        ]
      })
  };
}

/** A stage action that is not built yet: say so, start nothing. */
export function notBuilt($: EngineInterface, key: string, label: string) {
  $.ui.toast(`${key}: ${label}. Not built yet: nothing started.`);
}
