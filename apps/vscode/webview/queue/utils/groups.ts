import { PALETTE } from '../../shared/utils/palette';
import type { Collapsed } from '../types/queue';

export const COLLAPSED_BY_DEFAULT = new Set(['Done']);

export const NEEDS_YOU_GROUP = 'Needs you';

const GROUP_DOT: Record<string, string> = {
  [NEEDS_YOU_GROUP]: PALETTE.violet.hex,
  Running: PALETTE.blue.hex
};

export const groupDot = (group: string) =>
  GROUP_DOT[group] ?? 'color-mix(in srgb, var(--atb-ink) 30%, transparent)';

export const isGroupOpen = (collapsed: Collapsed, group: string) =>
  !(collapsed[group] ?? COLLAPSED_BY_DEFAULT.has(group));
