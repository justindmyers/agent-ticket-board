import type { RenderElement } from 'claude-code';
import { formatValue, itemProblem, parseValue } from './field-text.gen';
import { hex, type Els } from './kit';

type Rule = { branch: string; to: string | null };
type Set = (text: string) => void;

const ASK = 'ask';

/** Why the last Add for a field did not go in, by field key. */
export const addErrors: Record<string, string> = {};

function addInput(
  ui: Els,
  key: string,
  label: string,
  kind: 'list' | 'rules',
  existing: string[],
  add: (item: string) => void
) {
  const rows: RenderElement[] = [
    ui.Input({
      key: `add-${key}`,
      label,
      placeholder:
        kind === 'list' ? 'Add a value' : 'A branch regular expression, for example ^release/',
      value: '',
      submitLabel: 'add',
      onSubmit: (v: string) => {
        const item = v.trim();
        const why =
          itemProblem(kind, item) ??
          (existing.includes(item) ? 'It is in the list already.' : null);
        if (why) {
          addErrors[key] = why;
        } else {
          delete addErrors[key];
          add(item);
        }
      }
    })
  ];
  if (addErrors[key]) {
    rows.push(ui.Text({ color: hex('red'), wrap: 'wrap', children: [addErrors[key]] }));
  }
  return rows;
}

/** A list field as items in order, with Up, Down, Remove and an Add input. */
export function listRows(ui: Els, key: string, label: string, value: string, set: Set) {
  const { Box, Text, Button } = ui;
  const items = parseValue('list', value) as string[];
  const put = (next: string[]) => set(formatValue('list', next));
  const move = (from: number, to: number) => {
    const next = [...items];
    next.splice(to, 0, ...next.splice(from, 1));
    put(next);
  };

  return [
    ...items.map((item, i) =>
      Box({
        key: `item-${key}-${i}`,
        flexDirection: 'row',
        columnGap: 1,
        children: [
          Text({ children: [item] }),
          Box({ key: 'sp', flexGrow: 1 }),
          ...(i > 0
            ? [
                Button({
                  key: `up-${key}-${i}`,
                  label: '↑',
                  plain: true,
                  onPress: () => move(i, i - 1)
                })
              ]
            : []),
          ...(i < items.length - 1
            ? [
                Button({
                  key: `down-${key}-${i}`,
                  label: '↓',
                  plain: true,
                  onPress: () => move(i, i + 1)
                })
              ]
            : []),
          Button({
            key: `remove-${key}-${i}`,
            label: 'Remove',
            plain: true,
            onPress: () => put(items.filter((_, j) => j !== i))
          })
        ]
      })
    ),
    ...addInput(ui, key, `Add to ${label}`, 'list', items, (item) => put([...items, item]))
  ];
}

/** Branch rules: a branch regular expression and the status after the merge, "Ask me" by default. */
export function ruleRows(ui: Els, key: string, value: string, statuses: string[], set: Set) {
  const { Box, Text, Button, Select } = ui;
  const rules = parseValue('rules', value) as Rule[];
  const put = (next: Rule[]) => set(formatValue('rules', next));
  const options = [
    { value: ASK, label: 'Ask me' },
    ...statuses.map((s) => ({ value: s, label: s }))
  ];

  return [
    ...(rules.length
      ? []
      : [Text({ dimColor: true, children: ['No rules. Every branch uses the default status.'] })]),
    ...rules.map((rule, i) =>
      Box({
        key: `rule-${key}-${i}`,
        flexDirection: 'row',
        columnGap: 1,
        flexWrap: 'wrap',
        children: [
          Text({ children: [rule.branch] }),
          Text({ dimColor: true, children: ['then'] }),
          Select({
            key: `to-${key}-${i}`,
            options,
            value: rule.to ?? ASK,
            onSelect: (to: string) =>
              put(rules.map((r, j) => (j === i ? { ...r, to: to === ASK ? null : to } : r)))
          }),
          Button({
            key: `remove-${key}-${i}`,
            label: 'Remove',
            plain: true,
            onPress: () => put(rules.filter((_, j) => j !== i))
          })
        ]
      })
    ),
    ...addInput(
      ui,
      key,
      'Add a branch rule',
      'rules',
      rules.map((r) => r.branch),
      (branch) => put([...rules, { branch, to: null }])
    )
  ];
}
