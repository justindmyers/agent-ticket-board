import { execFileSync } from 'node:child_process';
import { mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONFIG } from '@agent-ticket-board/core';
import { lastChange, lastChangedFile } from './stages';

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

  it('also counts a file that is committed on the branch, so a commit does not hide a later edit', () => {
    const dir = mkdtempSync(join(tmpdir(), 'atb-change-'));
    const git = (...a: string[]) =>
      execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: dir });
    git('init', '-q', '-b', 'main');
    writeFileSync(join(dir, 'App.tsx'), 'a');
    git('add', '.');
    git('commit', '-qm', 'base');
    git('update-ref', `refs/remotes/origin/${CONFIG.repo.baseBranch}`, 'HEAD');
    git('checkout', '-q', '-b', 'feature/X-1');
    writeFileSync(join(dir, 'App.tsx'), 'b');
    writeFileSync(join(dir, 'Docs.md'), 'd');
    writeFileSync(join(dir, 'App.test.tsx'), 't');
    git('add', '.');
    git('commit', '-qm', 'feat(x): change the app (X-1)');
    utimesSync(join(dir, 'App.tsx'), 5000, 5000);
    utimesSync(join(dir, 'Docs.md'), 9000, 9000);
    utimesSync(join(dir, 'App.test.tsx'), 9000, 9000);
    expect(lastChangedFile(dir)).toEqual({ file: 'App.tsx', at: 5_000_000 });
  });
});
