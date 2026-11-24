export type Confidence = 'high' | 'medium' | 'low';

export type SettingsField = {
  key: string;
  label: string;
  help: string;
  kind: string;
  text: string;
  source: 'config' | 'default';
  proposal?: { text: string; source: string; confidence: Confidence; same: boolean };
};

export type SectionId = 'tracker' | 'repo' | 'app';

export type SettingsSection = { id: SectionId; title: string; fields: SettingsField[] };

export type SettingsView = {
  file: string;
  sections: SettingsSection[];
  gaps: { key: string; files: string[] }[];
  checks: { name: string; ok: boolean; detail: string }[];
};

export type Detecting = SectionId | 'all' | null;
