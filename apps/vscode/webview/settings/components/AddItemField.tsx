import { mdiPlus } from '@mdi/js';
import { itemProblem } from '@agent-ticket-board/core/field-text';
import { useState } from 'react';
import { FieldError, Input, Label, TextField } from 'react-aria-components';
import { Button } from '../../shared/components/Button';
import { Icon } from '../../shared/components/Icon';
import { INPUT_CLASS } from '../utils/inputs';

type Props = {
  kind: 'list' | 'rules';
  label: string;
  placeholder: string;
  existing: string[];
  onAdd: (item: string) => void;
};

/** One text box that adds an item. It checks the item first, so the field text stays readable. */
export function AddItemField({ kind, label, placeholder, existing, onAdd }: Props) {
  const [text, setText] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const add = () => {
    const item = text.trim();
    const why =
      itemProblem(kind, item) ?? (existing.includes(item) ? 'It is in the list already.' : null);
    setProblem(why);
    if (!why) {
      onAdd(item);
      setText('');
    }
  };

  return (
    <div className="flex items-start gap-2">
      <TextField
        value={text}
        onChange={(v) => {
          setText(v);
          setProblem(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            add();
          }
        }}
        isInvalid={!!problem}
        className="grid min-w-0 flex-1 gap-1"
      >
        <Label className="sr-only">{label}</Label>
        <Input className={INPUT_CLASS} placeholder={placeholder} />
        <FieldError className="text-[11.5px] text-problem">{problem}</FieldError>
      </TextField>
      <Button className="h-8 px-2.5" onPress={add}>
        <Icon path={mdiPlus} size={14} />
        Add
      </Button>
    </div>
  );
}
