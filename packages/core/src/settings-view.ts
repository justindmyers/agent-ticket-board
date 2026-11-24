import { join } from 'node:path';
import { get, has, isEqual } from 'lodash-es';
import { loadConfig, setConfigValue } from './config';
import { CONFIG_FIELDS, CONFIG_SECTIONS, type ConfigField } from './config-fields';
import type { Check, Detection, Proposal } from './detect';
import type { Gap } from './detect-repo';
import { formatValue, parseValue } from './field-text';
import { readJson } from './files';
import { HOME } from './paths';

export { CONFIG_SECTIONS };

export type SettingsField = ConfigField & {
  value: unknown;
  text: string;
  source: 'config' | 'default';
  proposal?: Proposal & { text: string; same: boolean };
};

export type SaveResult = { saved: string[]; errors: Record<string, string> };

export type SettingsView = {
  file: string;
  sections: { id: string; title: string; fields: SettingsField[] }[];
  gaps: Gap[];
  checks: Check[];
};

export async function settingsView(detection?: Detection): Promise<SettingsView> {
  const file = join(HOME, 'config.json');
  const raw = await readJson<object>(file, {});
  const config = await loadConfig();
  const proposals = new Map(detection?.proposals.map((p) => [p.key, p]));
  const fieldView = (f: ConfigField): SettingsField => {
    const value = get(config, f.key);
    const p = proposals.get(f.key);
    return {
      ...f,
      value,
      text: formatValue(f.kind, value),
      source: has(raw, f.key) ? 'config' : 'default',
      ...(p
        ? { proposal: { ...p, text: formatValue(f.kind, p.value), same: isEqual(p.value, value) } }
        : {})
    };
  };
  return {
    file,
    sections: CONFIG_SECTIONS.map((s) => ({ ...s, fields: s.fields.map(fieldView) })),
    gaps: detection?.gaps ?? [],
    checks: detection?.checks ?? []
  };
}

export async function saveSettings(texts: Record<string, string>): Promise<SaveResult> {
  const result: SaveResult = { saved: [], errors: {} };
  for (const [key, text] of Object.entries(texts)) {
    const field = CONFIG_FIELDS.find((f) => f.key === key);
    try {
      await setConfigValue(key, field ? parseValue(field.kind, text) : text);
      result.saved.push(key);
    } catch (e) {
      result.errors[key] = e instanceof Error ? e.message : String(e);
    }
  }
  return result;
}
