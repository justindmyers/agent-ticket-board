import { mdiArrowDown, mdiArrowUp, mdiClose } from '@mdi/js';
import { GridListItem } from 'react-aria-components';
import { Button } from '../../shared/components/Button';
import { Icon } from '../../shared/components/Icon';
import { ROW_CLASS } from '../utils/inputs';

type Props = {
  list: string;
  item: string;
  index: number;
  count: number;
  onMove: (from: number, to: number) => void;
  onRemove: (index: number) => void;
};

export function ListEditorItem({ list, item, index, count, onMove, onRemove }: Props) {
  return (
    <GridListItem id={index} textValue={item} className={ROW_CLASS}>
      <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-ink/90">{item}</span>
      <Button
        variant="ghost"
        className="h-7 w-7 p-0"
        aria-label={`Move ${item} up in ${list}`}
        isDisabled={index === 0}
        onPress={() => onMove(index, index - 1)}
      >
        <Icon path={mdiArrowUp} size={14} />
      </Button>
      <Button
        variant="ghost"
        className="h-7 w-7 p-0"
        aria-label={`Move ${item} down in ${list}`}
        isDisabled={index === count - 1}
        onPress={() => onMove(index, index + 1)}
      >
        <Icon path={mdiArrowDown} size={14} />
      </Button>
      <Button
        variant="ghost"
        className="h-7 w-7 p-0"
        aria-label={`Remove ${item} from ${list}`}
        onPress={() => onRemove(index)}
      >
        <Icon path={mdiClose} size={14} />
      </Button>
    </GridListItem>
  );
}
