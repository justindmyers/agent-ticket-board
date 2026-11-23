import type { Key } from 'react-aria-components';
import type { Group } from '../../shared/types/host';

type Options = {
  group: Group;
  selected: string | null;
  pressOpens: boolean;
  onSelect: (k: string) => void;
  onOpen: (k: string) => void;
};

// Sidebar and narrow layouts: a press opens the ticket. Split layout: selection follows focus.
export function listProps({ group, selected, pressOpens, onSelect, onOpen }: Options) {
  if (pressOpens) {
    return { selectionMode: 'none' as const, onAction: (k: Key) => onOpen(String(k)) };
  }
  return {
    selectionMode: 'single' as const,
    selectionBehavior: 'replace' as const,
    disallowEmptySelection: true,
    selectedKeys: selected && group.tickets.some((t) => t.key === selected) ? [selected] : [],
    onSelectionChange: (s: 'all' | Set<Key>) => {
      const k = s !== 'all' && [...s][0];
      if (k) {
        onSelect(String(k));
      }
    },
    onAction: (k: Key) => onOpen(String(k))
  };
}
