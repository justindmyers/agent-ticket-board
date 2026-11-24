import { formatValue, parseValue } from '@agent-ticket-board/core/field-text';
import { GridList } from 'react-aria-components';
import type { Rule } from '../types/settings';
import { LIST_CLASS } from '../utils/inputs';
import { AddItemField } from './AddItemField';
import { RuleRow } from './RuleRow';

type Props = {
  labelId: string;
  text: string;
  statuses: string[];
  onChange: (text: string) => void;
};

/** Branch rules: a branch regular expression and the status after the merge ("Ask me" by default). */
export function RulesEditor({ labelId, text, statuses, onChange }: Props) {
  const rules = parseValue('rules', text) as Rule[];
  const set = (next: Rule[]) => onChange(formatValue('rules', next));

  return (
    <div className="grid gap-1.5">
      <GridList
        aria-labelledby={labelId}
        layout="stack"
        className={LIST_CLASS}
        renderEmptyState={() => (
          <p className="m-0 px-2.5 py-2 text-[12px] text-muted">
            No rules. Every branch uses the default status.
          </p>
        )}
      >
        {rules.map((rule, i) => (
          <RuleRow
            key={`${i}-${rule.branch}`}
            rule={rule}
            index={i}
            statuses={statuses}
            onStatus={(at, to) => set(rules.map((r, j) => (j === at ? { ...r, to } : r)))}
            onRemove={(at) => set(rules.filter((_, j) => j !== at))}
          />
        ))}
      </GridList>
      <AddItemField
        kind="rules"
        label="Add a branch rule"
        placeholder="A branch regular expression, for example ^release/"
        existing={rules.map((r) => r.branch)}
        onAdd={(branch) => set([...rules, { branch, to: null }])}
      />
    </div>
  );
}
