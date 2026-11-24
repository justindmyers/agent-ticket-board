import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Run } from './detect';

const home = mkdtempSync(join(tmpdir(), 'atb-'));
process.env.ATB_HOME = home;

let detect: typeof import('./detect');
let config: typeof import('./config');
beforeAll(async () => {
  detect = await import('./detect');
  config = await import('./config');
});

const GH = JSON.stringify({
  hosts: { 'github.com': [{ state: 'success', active: true, host: 'github.com', login: 'dev' }] }
});

const fakeRun =
  (out: Record<string, string>): Run =>
  async (cmd, args) => {
    const key = [cmd, ...args].join(' ');
    const hit = Object.keys(out).find((k) => key.startsWith(k));
    if (hit === undefined) {
      throw new Error(`not signed in: ${key}`);
    }
    return out[hit];
  };

describe('detect', () => {
  it('reports which tools are signed in', async () => {
    const d = await detect.detect({ run: fakeRun({ 'gh auth status': GH }) });
    expect(d.checks).toEqual([
      { name: 'Jira (acli)', ok: false, detail: 'Not signed in. Run: acli jira auth login' },
      { name: 'GitHub (gh)', ok: true, detail: 'Signed in to github.com as dev' }
    ]);
  });

  it('runs only the section that the developer asks for again', async () => {
    const d = await detect.detect({ run: fakeRun({ 'gh auth status': GH }), only: 'repo' });
    expect(d.checks).toEqual([]);
    expect(d.proposals).toEqual([]);
  });
});

describe('mergeDetection', () => {
  const p = (key: string, value: string) => ({
    key,
    value,
    source: 's',
    confidence: 'high' as const
  });
  const before = {
    proposals: [p('tracker.site', 'old.example.net'), p('repo.branch', '{key}')],
    gaps: [{ key: 'repo.prTitle', files: ['CONTRIBUTING.md'] }],
    checks: [{ name: 'GitHub (gh)', ok: true, detail: 'Signed in' }]
  };

  it('replaces only the section that ran again, and keeps the rest', () => {
    const next = { proposals: [p('tracker.site', 'new.example.net')], gaps: [], checks: [] };
    expect(detect.mergeDetection(before, next, 'tracker')).toEqual({
      proposals: [p('repo.branch', '{key}'), p('tracker.site', 'new.example.net')],
      gaps: before.gaps,
      checks: before.checks
    });
  });

  it('takes the new detection when every section ran', () => {
    const next = { proposals: [], gaps: [], checks: [] };
    expect(detect.mergeDetection(before, next)).toBe(next);
  });
});

describe('setConfigValue', () => {
  it('writes one value into config.json and keeps the others', async () => {
    await config.setConfigValue('tracker.project', 'PROJ');
    await config.setConfigValue('app.ownerPort', 4200);
    const file = JSON.parse(readFileSync(join(home, 'config.json'), 'utf8'));
    expect(file).toEqual({ tracker: { project: 'PROJ' }, app: { ownerPort: 4200 } });
    expect((await config.loadConfig()).tracker.project).toBe('PROJ');
  });

  it('refuses a key that the config does not have', async () => {
    await expect(config.setConfigValue('tracker.password', 'x')).rejects.toThrow(
      /Unknown config key/
    );
  });
});
