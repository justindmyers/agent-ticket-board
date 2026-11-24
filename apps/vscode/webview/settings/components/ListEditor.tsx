import { formatValue, parseValue } from '@agent-ticket-board/core/field-text';
import { GridList } from 'react-aria-components';
import { LIST_CLASS } from '../utils/inputs';
import { AddItemField } from './AddItemField';
import { ListEditorItem } from './ListEditorItem';

type Props = { label: string; labelId: string; text: string; onChange: (text: string) => void };

/** A list field (statuses, columns) as items in order, with Move, Remove and Add. */
export function ListEditor({ label, labelId, text, onChange }: Props) {
  const items = parseValue('list', text) as string[];
  const set = (next: string[]) => onChange(formatValue('list', next));
  const move = (from: number, to: number) => {
    const next = [...items];
    next.splice(to, 0, ...next.splice(from, 1));
    set(next);
  };

  return (
    <div className="grid gap-1.5">
      <GridList
        aria-labelledby={labelId}
        layout="stack"
        className={LIST_CLASS}
        renderEmptyState={() => (
          <p className="m-0 px-2.5 py-2 text-[12px] text-muted">No items yet.</p>
        )}
      >
        {items.map((item, i) => (
          <ListEditorItem
            key={`${i}-${item}`}
            list={label}
            item={item}
            index={i}
            count={items.length}
            onMove={move}
            onRemove={(at) => set(items.filter((_, j) => j !== at))}
          />
        ))}
      </GridList>
      <AddItemField
        kind="list"
        label={`Add to ${label}`}
        placeholder="Add a value"
        existing={items}
        onAdd={(item) => set([...items, item])}
      />
    </div>
  );
}
