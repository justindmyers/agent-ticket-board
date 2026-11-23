import type { ReactNode } from 'react';
import type { Snapshot } from '../../shared/types/host';
import type { Theme } from '../../shared/types/theme';
import type { Collapsed, SetCollapsed } from '../types/queue';
import { isGroupOpen } from '../utils/groups';
import { QueueGroup } from './QueueGroup';
import { QueueSkeleton } from './QueueSkeleton';

type Props = {
  data: Snapshot | null;
  selected: string | null;
  onSelect: (k: string) => void;
  onOpen: (k: string) => void;
  sidebar: boolean;
  openOnPress?: boolean;
  header: ReactNode;
  theme: Theme;
  collapsed: Collapsed;
  setCollapsed: SetCollapsed;
};

export function Queue({
  data,
  selected,
  onSelect,
  onOpen,
  sidebar,
  openOnPress = false,
  header,
  theme,
  collapsed,
  setCollapsed
}: Props) {
  const groups = data?.groups ?? [];

  return (
    <nav className="flex h-full min-h-0 min-w-0 flex-col" aria-label="Ticket queue">
      {header}
      <div className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-5" data-queue>
        {!data ? (
          <QueueSkeleton />
        ) : groups.length === 0 ? (
          <p className="p-3 text-muted">No tickets in the open sprint.</p>
        ) : (
          groups.map((g) => (
            <QueueGroup
              key={g.group}
              group={g}
              open={isGroupOpen(collapsed, g.group)}
              onOpenChange={(open) => setCollapsed((c) => ({ ...c, [g.group]: !open }))}
              selected={selected}
              pressOpens={sidebar || openOnPress}
              onSelect={onSelect}
              onOpen={onOpen}
              theme={theme}
            />
          ))
        )}
      </div>
    </nav>
  );
}
