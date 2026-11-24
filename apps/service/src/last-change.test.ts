import { execFileSync } from 'node:child_process';
import { mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { lastChange } from './stages';

describe('lastChange', () => {
  it('is the newest changed or new file that can change the page; tests and docs do not count', () => {
    const dir = mkdtempSync(join(tmpdir(), 'atb-change-'));
    const git = (...a: string[]) =>
      execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: dir });
    git('init', '-q');
    writeFileSync(join(dir, 'App.tsx'), 'a');
    git('add', '.');
    git('commit', '-qm', 'base');
    writeFileSync(join(dir, 'App.tsx'), 'b');
    writeFileSync(join(dir, 'New.tsx'), 'n');
    writeFileSync(join(dir, 'New.test.tsx'), 't');
    writeFileSync(join(dir, 'notes.md'), 'm');
    utimesSync(join(dir, 'App.tsx'), 1000, 1000);
    utimesSync(join(dir, 'New.tsx'), 2000, 2000);
    utimesSync(join(dir, 'New.test.tsx'), 9000, 9000);
    utimesSync(join(dir, 'notes.md'), 9000, 9000);
    expect(lastChange(dir)).toBe(2_000_000);
  });
});
