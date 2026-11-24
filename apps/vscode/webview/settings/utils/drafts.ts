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
