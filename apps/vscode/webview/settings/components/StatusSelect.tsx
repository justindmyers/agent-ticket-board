import { mdiChevronDown } from '@mdi/js';
import { Label, ListBox, ListBoxItem, Popover, Select, SelectValue } from 'react-aria-components';
import { Button } from '../../shared/components/Button';
import { Icon } from '../../shared/components/Icon';
import { MENU_ITEM_CLASS, POPOVER_CLASS } from '../../shared/utils/classes';
import { cx } from '../../shared/utils/cx';

export const ASK = 'ask';

type Props = {
  label: string;
  value: string | null;
  statuses: string[];
  onChange: (to: string | null) => void;
};

/** The status after the merge for one branch rule: a configured column, or "Ask me". */
export function StatusSelect({ label, value, statuses, onChange }: Props) {
  const items = [{ id: ASK, label: 'Ask me' }, ...statuses.map((s) => ({ id: s, label: s }))];

  return (
    <Select
      value={value ?? ASK}
      onChange={(k) => onChange(k === ASK ? null : String(k))}
      className="shrink-0"
    >
      <Label className="sr-only">{label}</Label>
      <Button
        variant="ghost"
        className="h-7 justify-between gap-1 border border-ink/10 px-2 text-[12px] text-soft"
      >
        <SelectValue />
        <Icon path={mdiChevronDown} size={13} />
      </Button>
      <Popover offset={4} className={cx(POPOVER_CLASS, 'min-w-[var(--trigger-width)]')}>
        <ListBox items={items} className="outline-none">
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
    </Select>
  );
}
