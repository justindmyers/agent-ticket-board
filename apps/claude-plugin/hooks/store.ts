import type { Detail, Sprint } from './types';

/** The pane state. One object, because a module that imports a `let` cannot assign it. */
export const store = {
  sprint: null as Sprint | null,
  updating: false,
  error: '',
  open: null as string | null,
  detail: null as Detail | null,
  draft: '',
  confirmMove: null as { key: string; to: string; from?: string } | null,
  tabs: {} as Record<string, string>,
  collapsed: {} as Record<string, boolean>
};

export const COLLAPSED_BY_DEFAULT = new Set(['Done']);

export const isOpen = (group: string) =>
  !(store.collapsed[group] ?? COLLAPSED_BY_DEFAULT.has(group));
