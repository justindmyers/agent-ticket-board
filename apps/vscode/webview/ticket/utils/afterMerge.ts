import type { JiraInfo } from '../../shared/types/host';

export const AUTO = '__auto';

function autoLabel(j: JiraInfo) {
  const a = j.afterMerge;
  if (a.source === 'rule') {
    return a.to ? `Automatic: ${a.to} (branch rule)` : 'Automatic: ask me (branch rule)';
  }
  return `Automatic: ${a.source === 'ticket' ? j.defaultAfterMerge : (a.to ?? j.defaultAfterMerge)}`;
}

export const ownAfterMerge = (j: JiraInfo) =>
  j.afterMerge.source === 'ticket' ? j.afterMerge.to : null;

export function afterMergeItems(j: JiraInfo) {
  const auto = ownAfterMerge(j)
    ? autoLabel({ ...j, afterMerge: { to: j.defaultAfterMerge, source: 'default' } })
    : autoLabel(j);
  return [{ id: AUTO, label: auto }, ...j.afterMergeOptions.map((s) => ({ id: s, label: s }))];
}
