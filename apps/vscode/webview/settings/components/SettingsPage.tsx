import { useState } from 'react';
import { useHostMessages } from '../../shared/hooks/useHostMessages';
import { useTheme } from '../../shared/hooks/useTheme';
import { send } from '../../shared/utils/vscodeApi';
import type { Detecting, SectionId, SettingsView } from '../../shared/types/settings';
import { changedDrafts, withoutKeys, type Drafts } from '../utils/drafts';
import { SaveBar } from './SaveBar';
import { SettingsHeader } from './SettingsHeader';
import { SettingsSection } from './SettingsSection';
import { SettingsSkeleton } from './SettingsSkeleton';
import { SignInChecks } from './SignInChecks';

export function SettingsPage() {
  const theme = useTheme();
  const [view, setView] = useState<SettingsView | null>(null);
  const [detecting, setDetecting] = useState<Detecting>(null);
  const [drafts, setDrafts] = useState<Drafts>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const changed = changedDrafts(view, drafts);
  const count = Object.keys(changed).length;

  useHostMessages((m) => {
    if (m.type === 'settings') {
      setView(m.view);
      setDetecting(null);
    }
    if (m.type === 'detecting') {
      setDetecting(m.only ?? 'all');
    }
    if (m.type === 'settingsSaved') {
      setDrafts((d) => withoutKeys(d, m.saved));
      setErrors(m.errors);
    }
  });

  const save = () => send({ type: 'saveSettings', texts: changed });
  const detect = (only?: SectionId) => send({ type: 'detect', ...(only ? { only } : {}) });
  const onChange = (key: string, text: string) => {
    setDrafts((d) => ({ ...d, [key]: text }));
    setErrors((e) => withoutKeys(e, [key]) as Record<string, string>);
  };

  return (
    <main className="mx-auto grid max-w-[920px] gap-4 p-5 pb-0 max-[640px]:p-3">
      <h1 className="sr-only">Agent Ticket Board: settings</h1>
      <SettingsHeader
        file={view?.file}
        detecting={detecting}
        onDetect={() => detect()}
        count={count}
        onSave={save}
      />

      {view && <SignInChecks checks={view.checks} theme={theme} />}
      {!view ? (
        <SettingsSkeleton />
      ) : (
        view.sections.map((s) => (
          <SettingsSection
            key={s.id}
            section={s}
            gaps={view.gaps}
            drafts={drafts}
            errors={errors}
            detecting={detecting}
            onChange={onChange}
            onDetect={() => detect(s.id)}
            theme={theme}
          />
        ))
      )}
      <SaveBar
        count={count}
        onSave={save}
        onDiscard={() => {
          setDrafts({});
          setErrors({});
        }}
      />
      <div className="h-5" />
    </main>
  );
}
