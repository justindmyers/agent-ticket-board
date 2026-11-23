import { mdiChevronDown } from '@mdi/js';
import {
  Label as AriaLabel,
  ListBox,
  ListBoxItem,
  Popover,
  Select,
  SelectValue
} from 'react-aria-components';
import { Button } from '../../shared/components/Button';
import { Icon } from '../../shared/components/Icon';
import type { JiraInfo } from '../../shared/types/host';
import { MENU_ITEM_CLASS, POPOVER_CLASS } from '../../shared/utils/classes';
import { cx } from '../../shared/utils/cx';
import { send } from '../../shared/utils/vscodeApi';
import { afterMergeItems, AUTO, ownAfterMerge } from '../utils/afterMerge';

type Props = { ticketKey: string; jira: JiraInfo };

export function AfterMergeSelect({ ticketKey, jira }: Props) {
  const askRule = jira.afterMerge.source === 'rule' && !jira.afterMerge.to;

  return (
    <Select
      selectedKey={ownAfterMerge(jira) ?? AUTO}
      onSelectionChange={(k) =>
        send({ type: 'setAfterMerge', key: ticketKey, to: k === AUTO ? null : String(k) })
      }
      className="mt-1 grid gap-1 border-t border-ink/[0.06] pt-2"
    >
      <AriaLabel className="text-[11.5px] text-muted">After the merge, move to</AriaLabel>
      <Button
        variant="ghost"
        className="justify-between border border-ink/10 px-2.5 py-1.5 text-[12.5px] text-soft"
      >
        <SelectValue />
        <Icon path={mdiChevronDown} size={14} />
      </Button>
      <Popover offset={4} className={cx(POPOVER_CLASS, 'min-w-[var(--trigger-width)]')}>
        <ListBox items={afterMergeItems(jira)} className="outline-none">
          {(it) => (
            <ListBoxItem
              id={it.id}
              className={cx(
                MENU_ITEM_CLASS,
                'data-[selected]:font-medium data-[selected]:text-ink'
              )}
            >
              {it.label}
            </ListBoxItem>
          )}
        </ListBox>
      </Popover>
      <span className="text-[11px] text-muted">
        {askRule
          ? 'A branch rule says to ask you. The agent never moves this ticket by itself.'
          : 'One click after the merge. The agent moves it only if you allow it above.'}
      </span>
    </Select>
  );
}
