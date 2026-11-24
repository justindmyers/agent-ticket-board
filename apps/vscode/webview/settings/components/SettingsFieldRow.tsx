import { useId } from 'react';
import { FieldError, Input, Label, Text, TextField } from 'react-aria-components';
import type { SettingsField } from '../../shared/types/settings';
import type { Theme } from '../../shared/types/theme';
import { cx } from '../../shared/utils/cx';
import { INPUT_CLASS } from '../utils/inputs';
import { ListEditor } from './ListEditor';
import { ProposalNote } from './ProposalNote';
import { RulesEditor } from './RulesEditor';

type Props = {
  field: SettingsField;
  value: string;
  changed: boolean;
  error?: string;
  gapFiles?: string[];
  statuses: string[];
  onChange: (text: string) => void;
  theme: Theme;
};

const ROW_GRID = 'grid gap-1 @[640px]:grid-cols-[200px_minmax(0,1fr)] @[640px]:gap-x-4';

export function SettingsFieldRow({
  field,
  value,
  changed,
  error,
  gapFiles,
  statuses,
  onChange,
  theme
}: Props) {
  const labelId = useId();
  const state = changed ? 'Not saved' : field.source === 'config' ? 'Your config' : 'Default';
  const structured = field.kind === 'list' || field.kind === 'rules';
  const notes = (
    <>
      <span className="text-[11.5px] text-muted">{field.help}</span>
      {error && <span className="text-[11.5px] text-problem">{error}</span>}
    </>
  );

  return (
    <div className="grid gap-1.5 border-t border-ink/[0.06] py-3 first:border-t-0 first:pt-1">
      {structured ? (
        <div role="group" aria-labelledby={labelId} className={ROW_GRID}>
          <div className="flex flex-col gap-0.5">
            <span id={labelId} className="text-[12.5px] font-medium text-ink/90">
              {field.label}
            </span>
            <span className="text-[11px] text-muted">{state}</span>
          </div>
          <div className="grid gap-1">
            {field.kind === 'list' ? (
              <ListEditor label={field.label} labelId={labelId} text={value} onChange={onChange} />
            ) : (
              <RulesEditor labelId={labelId} text={value} statuses={statuses} onChange={onChange} />
            )}
            {notes}
          </div>
        </div>
      ) : (
        <TextField value={value} onChange={onChange} isInvalid={!!error} className={ROW_GRID}>
          <div className="flex flex-col gap-0.5">
            <Label className="text-[12.5px] font-medium text-ink/90">{field.label}</Label>
            <span className="text-[11px] text-muted">{state}</span>
          </div>
          <div className="grid gap-1">
            <Input
              className={cx(INPUT_CLASS, changed && 'border-[var(--atb-agent-ring)]')}
              placeholder="Empty"
            />
            <Text slot="description" className="text-[11.5px] text-muted">
              {field.help}
            </Text>
            <FieldError className="text-[11.5px] text-problem">{error}</FieldError>
          </div>
        </TextField>
      )}

      <div className="@[640px]:pl-[216px]">
        {field.proposal && (
          <ProposalNote
            proposal={field.proposal}
            label={field.label}
            current={value}
            onUse={() => onChange(field.proposal!.text)}
            theme={theme}
          />
        )}
        {gapFiles && (
          <span className="text-[11.5px] text-muted">
            Set up with Claude can fill this from {gapFiles.join(', ')}.
          </span>
        )}
      </div>
    </div>
  );
}
