import { mdiChevronDown, mdiChevronRight } from '@mdi/js';
import { Disclosure, DisclosurePanel, Heading, ListBox } from 'react-aria-components';
import { Button } from '../../shared/components/Button';
import { Dot } from '../../shared/components/Dot';
import { Icon } from '../../shared/components/Icon';
import type { Group } from '../../shared/types/host';
import type { Theme } from '../../shared/types/theme';
import { cx } from '../../shared/utils/cx';
import { groupDot, NEEDS_YOU_GROUP } from '../utils/groups';
import { listProps } from '../utils/listProps';
import { QueueRow } from './QueueRow';

type Props = {
  group: Group;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selected: string | null;
  pressOpens: boolean;
  onSelect: (k: string) => void;
  onOpen: (k: string) => void;
  theme: Theme;
};

export function QueueGroup({
  group,
  open,
  onOpenChange,
  selected,
  pressOpens,
  onSelect,
  onOpen,
  theme
}: Props) {
  return (
    <Disclosure
      isExpanded={open}
      onExpandedChange={onOpenChange}
      className="border-t border-ink/[0.08] py-1.5 first:border-t-0 hc:border-[var(--vscode-contrastBorder)]"
    >
      <Heading className="m-0">
        <Button
          slot="trigger"
          variant="ghost"
          className="h-8 w-full justify-start gap-2 rounded-lg px-2 text-[11px] font-medium tracking-[0.08em] uppercase"
        >
          <Icon path={open ? mdiChevronDown : mdiChevronRight} size={14} className="text-muted" />
          <Dot color={groupDot(group.group, group.state)} />
          <span
            className={cx(
              'min-w-0 flex-1 text-left',
              group.group === NEEDS_YOU_GROUP ? 'text-soft' : 'text-muted'
            )}
          >
            {group.group}
          </span>
          <span className="text-muted tabular-nums">{group.tickets.length}</span>
        </Button>
      </Heading>

      <DisclosurePanel>
        <ListBox
          aria-label={group.group}
          className="pt-1 outline-none"
          items={group.tickets}
          dependencies={[selected, theme]}
          {...listProps({ group, selected, pressOpens, onSelect, onOpen })}
        >
          {(t) => <QueueRow t={t} current={t.key === selected} theme={theme} />}
        </ListBox>
      </DisclosurePanel>
    </Disclosure>
  );
}
