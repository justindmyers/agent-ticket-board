import { PALETTE, STATE_ACCENT, type TrackerState } from '@agent-ticket-board/core/look';
import type { Collapsed } from '../types/queue';

export const COLLAPSED_BY_DEFAULT = new Set(['Done']);

export const NEEDS_YOU_GROUP = 'Needs you';

const GROUP_DOT: Record<string, string> = {
  [NEEDS_YOU_GROUP]: PALETTE.violet.hex,
  Running: PALETTE.blue.hex
};

// Not started stays a quiet ink dot, not the neutral accent: it is the most common state.
const QUIET_DOT = 'color-mix(in srgb, var(--atb-ink) 30%, transparent)';

export const groupDot = (group: string, state: TrackerState = 'todo') =>
  GROUP_DOT[group] ?? (state === 'todo' ? QUIET_DOT : PALETTE[STATE_ACCENT[state]].hex);

export const isGroupOpen = (collapsed: Collapsed, group: string) =>
  !(collapsed[group] ?? COLLAPSED_BY_DEFAULT.has(group));
