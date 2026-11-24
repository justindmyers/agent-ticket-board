import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { get } from 'lodash-es';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Detection } from './detect';

const home = mkdtempSync(join(tmpdir(), 'atb-'));
process.env.ATB_HOME = home;

let view: typeof import('./settings-view');
let config: typeof import('./config');
beforeAll(async () => {
  view = await import('./settings-view');
  config = await import('./config');
  writeFileSync(join(home, 'config.json'), JSON.stringify({ tracker: { project: 'PROJ' } }));
  await config.loadConfig();
});

const field = (v: Awaited<ReturnType<typeof view.settingsView>>, key: string) =>
  v.sections.flatMap((s) => s.fields).find((f) => f.key === key)!;

const DETECTION: Detection = {
  proposals: [
    { key: 'tracker.project', value: 'PROJ', source: 'acli', confidence: 'high' },
    { key: 'tracker.site', value: 'example.atlassian.net', source: 'acli', confidence: 'high' }
  ],
  gaps: [{ key: 'repo.prTitle', files: ['CONTRIBUTING.md'] }],
  checks: [{ name: 'GitHub (gh)', ok: true, detail: 'Signed in' }]
};

describe('CONFIG_SECTIONS', () => {
  it('describes every config value that the developer can change', () => {
    const described = view.CONFIG_SECTIONS.flatMap((s) => s.fields.map((f) => f.key)).sort();
    const all = Object.entries(config.DEFAULTS)
      .flatMap(([s, o]) => Object.keys(o).map((k) => `${s}.${k}`))
      .filter((k) => k !== 'tracker.kind')
      .sort();
    expect(described).toEqual(all);
  });
});

describe('settingsView', () => {
  it('shows each value and whether it comes from the config file or the default', async () => {
    const v = await view.settingsView();
    expect(field(v, 'tracker.project')).toMatchObject({ value: 'PROJ', source: 'config' });
    expect(field(v, 'tracker.afterMerge')).toMatchObject({ value: 'Done', source: 'default' });
  });

  it('adds the detected value to each field, and marks a value that is already the same', async () => {
    const v = await view.settingsView(DETECTION);
    expect(field(v, 'tracker.project').proposal).toMatchObject({ value: 'PROJ', same: true });
    expect(field(v, 'tracker.site').proposal).toMatchObject({
      value: 'example.atlassian.net',
      same: false
    });
    expect(v.gaps).toEqual(DETECTION.gaps);
    expect(v.checks).toEqual(DETECTION.checks);
  });

  it('gives each value and each detected value as text that a person can edit', async () => {
    const v = await view.settingsView(DETECTION);
    expect(field(v, 'tracker.columns').text).toBe('To Do, In Progress, Code Review, Done');
    expect(field(v, 'tracker.site').proposal?.text).toBe('example.atlassian.net');
  });
});

describe('saveSettings', () => {
  it('saves the values that are correct and reports the others by key', async () => {
    const r = await view.saveSettings({
      'tracker.finished': 'Done, Closed',
      'app.ownerPort': 'abc',
      'tracker.password': 'x'
    });
    expect(r.saved).toEqual(['tracker.finished']);
    expect(Object.keys(r.errors).sort()).toEqual(['app.ownerPort', 'tracker.password']);
    expect(r.errors['app.ownerPort']).toMatch(/must be a port number/);
    const v = await view.settingsView();
    expect(field(v, 'tracker.finished')).toMatchObject({
      value: ['Done', 'Closed'],
      source: 'config'
    });
    expect(field(v, 'app.ownerPort').value).toBe(3000);
  });
});

describe('setConfigValue types', () => {
  it.each([
    ['tracker.columns', 'To Do, Done'],
    ['tracker.columns', [1, 2]],
    ['app.ownerPort', '3000'],
    ['app.ownerPort', 70000],
    ['app.buildPorts', [3005, 3001]],
    ['tracker.afterMergeRules', [{ branch: '^hotfix/' }]],
    ['tracker.site', 42]
  ])('refuses %s = %j', async (key, value) => {
    await expect(config.setConfigValue(key, value)).rejects.toThrow(/must be/);
  });

  it('accepts a value of the right type', async () => {
    await config.setConfigValue('tracker.afterMergeRules', [{ branch: '^hotfix/', to: null }]);
    await config.setConfigValue('app.buildPorts', [3001, 3005]);
    expect(get(await config.loadConfig(), 'app.buildPorts')).toEqual([3001, 3005]);
  });
});
