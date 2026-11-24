import type { TrackerState } from '../../shared/types/host';
import { PALETTE } from '../../shared/utils/palette';
import type { Collapsed } from '../types/queue';

export const COLLAPSED_BY_DEFAULT = new Set(['Done']);

export const NEEDS_YOU_GROUP = 'Needs you';

const GROUP_DOT: Record<string, string> = {
  [NEEDS_YOU_GROUP]: PALETTE.violet.hex,
  Running: PALETTE.blue.hex
};

const STATE_DOT: Record<TrackerState, string> = {
  todo: 'color-mix(in srgb, var(--atb-ink) 30%, transparent)',
  active: PALETTE.blue.hex,
  blocked: PALETTE.red.hex,
  done: PALETTE.green.hex
};

export const groupDot = (group: string, state?: TrackerState) =>
  GROUP_DOT[group] ?? STATE_DOT[state ?? 'todo'];

export const isGroupOpen = (collapsed: Collapsed, group: string) =>
  !(collapsed[group] ?? COLLAPSED_BY_DEFAULT.has(group));
