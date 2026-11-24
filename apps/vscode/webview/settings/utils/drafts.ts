import { parseValue } from '@agent-ticket-board/core/field-text';
import type { SettingsView } from '../../shared/types/settings';

export type Drafts = Record<string, string>;

export const changedDrafts = (view: SettingsView | null, drafts: Drafts): Drafts => {
  const fields = view?.sections.flatMap((s) => s.fields) ?? [];
  return Object.fromEntries(
    Object.entries(drafts).filter(([k, v]) => fields.find((f) => f.key === k)?.text !== v)
  );
};

export const withoutKeys = (drafts: Drafts, keys: string[]): Drafts =>
  Object.fromEntries(Object.entries(drafts).filter(([k]) => !keys.includes(k)));

/** The board columns for the status choices of a branch rule, with an unsaved edit of the columns. */
export const columnsOf = (view: SettingsView | null, drafts: Drafts): string[] => {
  const field = view?.sections.flatMap((s) => s.fields).find((f) => f.key === 'tracker.columns');
  return field ? (parseValue('list', drafts[field.key] ?? field.text) as string[]) : [];
};
