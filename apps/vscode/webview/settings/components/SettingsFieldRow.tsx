import { FieldError, Input, Label, Text, TextField } from 'react-aria-components';
import type { Theme } from '../../shared/types/theme';
import { cx } from '../../shared/utils/cx';
import type { SettingsField } from '../../shared/types/settings';
import { ProposalNote } from './ProposalNote';

type Props = {
  field: SettingsField;
  value: string;
  changed: boolean;
  error?: string;
  gapFiles?: string[];
  onChange: (text: string) => void;
  theme: Theme;
};

export function SettingsFieldRow({
  field,
  value,
  changed,
  error,
  gapFiles,
  onChange,
  theme
}: Props) {
  return (
    <div className="grid gap-1.5 border-t border-ink/[0.06] py-3 first:border-t-0 first:pt-1">
      <TextField
        value={value}
        onChange={onChange}
        isInvalid={!!error}
        className="grid gap-1 @[640px]:grid-cols-[200px_minmax(0,1fr)] @[640px]:gap-x-4"
      >
        <div className="flex flex-col gap-0.5">
          <Label className="text-[12.5px] font-medium text-ink/90">{field.label}</Label>
          <span className="text-[11px] text-muted">
            {changed ? 'Not saved' : field.source === 'config' ? 'Your config' : 'Default'}
          </span>
        </div>
        <div className="grid gap-1">
          <Input
            className={cx(
              'h-8 w-full rounded-md border bg-ink/[0.03] px-2.5 font-mono text-[12.5px] text-ink/90 transition-colors outline-none placeholder:text-muted focus:border-ink/30 focus:bg-ink/[0.05] light:bg-base',
              changed ? 'border-[var(--atb-agent-ring)]' : 'border-ink/10',
              error && 'border-problem'
            )}
            placeholder="Empty"
          />
          <Text slot="description" className="text-[11.5px] text-muted">
            {field.help}
          </Text>
          <FieldError className="text-[11.5px] text-problem">{error}</FieldError>
        </div>
      </TextField>

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
