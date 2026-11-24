import { mdiClose } from '@mdi/js';
import { GridListItem } from 'react-aria-components';
import { Button } from '../../shared/components/Button';
import { Icon } from '../../shared/components/Icon';
import type { Rule } from '../types/settings';
import { ROW_CLASS } from '../utils/inputs';
import { StatusSelect } from './StatusSelect';

type Props = {
  rule: Rule;
  index: number;
  statuses: string[];
  onStatus: (index: number, to: string | null) => void;
  onRemove: (index: number) => void;
};

export function RuleRow({ rule, index, statuses, onStatus, onRemove }: Props) {
  return (
    <GridListItem id={index} textValue={rule.branch} className={ROW_CLASS}>
      <code className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-ink/90">
        {rule.branch}
      </code>
      <span className="text-[11.5px] text-muted">then</span>
      <StatusSelect
        label={`Status after the merge for ${rule.branch}`}
        value={rule.to}
        statuses={statuses}
        onChange={(to) => onStatus(index, to)}
      />
      <Button
        variant="ghost"
        className="h-7 w-7 p-0"
        aria-label={`Remove the rule ${rule.branch}`}
        onPress={() => onRemove(index)}
      >
        <Icon path={mdiClose} size={14} />
      </Button>
    </GridListItem>
  );
}
