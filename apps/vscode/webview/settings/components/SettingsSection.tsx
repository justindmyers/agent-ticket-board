import { mdiRefresh } from '@mdi/js';
import { Button } from '../../shared/components/Button';
import { Icon } from '../../shared/components/Icon';
import { Section } from '../../shared/components/Section';
import type { Theme } from '../../shared/types/theme';
import type { Detecting, SettingsSection as Data, SettingsView } from '../../shared/types/settings';
import type { Drafts } from '../utils/drafts';
import { DETECTABLE, SECTION_ICON } from '../utils/sections';
import { SettingsFieldRow } from './SettingsFieldRow';

type Props = {
  section: Data;
  gaps: SettingsView['gaps'];
  drafts: Drafts;
  errors: Record<string, string>;
  detecting: Detecting;
  statuses: string[];
  onChange: (key: string, text: string) => void;
  onDetect: () => void;
  theme: Theme;
};

export function SettingsSection({
  section,
  gaps,
  drafts,
  errors,
  detecting,
  statuses,
  onChange,
  onDetect,
  theme
}: Props) {
  const busy = detecting === 'all' || detecting === section.id;

  return (
    <Section
      icon={SECTION_ICON[section.id]}
      title={section.title}
      accent="neutral"
      theme={theme}
      aside={
        DETECTABLE.includes(section.id) ? (
          <Button
            variant="ghost"
            className="h-7 px-2"
            isDisabled={!!detecting}
            aria-label={`Detect the ${section.title.toLowerCase()} values again`}
            onPress={onDetect}
          >
            <Icon
              path={mdiRefresh}
              size={14}
              className={busy ? 'animate-spin motion-reduce:animate-none' : undefined}
            />
            {busy ? 'Detecting…' : 'Detect again'}
          </Button>
        ) : undefined
      }
    >
      <div className="@container">
        {section.fields.map((f) => (
          <SettingsFieldRow
            key={f.key}
            field={f}
            value={drafts[f.key] ?? f.text}
            changed={f.key in drafts && drafts[f.key] !== f.text}
            error={errors[f.key]}
            gapFiles={gaps.find((g) => g.key === f.key)?.files}
            statuses={statuses}
            onChange={(text) => onChange(f.key, text)}
            theme={theme}
          />
        ))}
      </div>
    </Section>
  );
}
