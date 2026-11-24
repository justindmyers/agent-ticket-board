import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { run } from './detect';
import { detectRepo } from './detect-repo';

const BRANCHES = [
  'main',
  'feat/PROJ-12-add-login',
  'fix/PROJ-40-crash-on-save',
  'feat/PROJ-7-dark-mode',
  'release-candidate'
];

let repo: string;

const git = (...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=Dev', '-c', 'user.email=dev@example.com', ...args], {
    cwd: repo
  });

const write = (file: string, text: string) => {
  mkdirSync(join(repo, file, '..'), { recursive: true });
  writeFileSync(join(repo, file), text);
};

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), 'atb-repo-'));
  git('init', '-q', '-b', 'main');
  write('package.json', JSON.stringify({ scripts: { dev: 'vite', 'new-worktree': 'node x.js' } }));
  write('pnpm-lock.yaml', '');
  write('vite.config.ts', 'export default { server: { port: 4200 } };');
  write('.github/pull_request_template.md', '## Summary');
  write('CONTRIBUTING.md', '# Contributing');
  git('add', '.');
  git('commit', '-q', '-m', 'init');
  git('remote', 'add', 'origin', 'git@github.com:example/example-app.git');
  for (const b of BRANCHES) {
    git('update-ref', `refs/remotes/origin/${b}`, 'HEAD');
  }
});

const byKey = (d: Awaited<ReturnType<typeof detectRepo>>) =>
  Object.fromEntries(d.proposals.map((p) => [p.key, p]));

describe('detectRepo', () => {
  it('proposes the repository path and the remote', async () => {
    const ps = byKey(await detectRepo(run, repo));
    expect(ps['repo.path'].value).toBe(repo);
    expect(ps['repo.remote']).toMatchObject({ value: 'example/example-app', confidence: 'high' });
  });

  it('finds the worktree script in package.json', async () => {
    const ps = byKey(await detectRepo(run, repo));
    expect(ps['repo.worktreeScript']).toMatchObject({
      value: 'pnpm new-worktree',
      confidence: 'medium'
    });
  });

  it('learns the branch pattern from the remote branches', async () => {
    const ps = byKey(await detectRepo(run, repo));
    expect(ps['repo.branch']).toMatchObject({ value: '{type}/{key}-{slug}', confidence: 'high' });
  });

  it('proposes the dev command and the port from the bundler config', async () => {
    const ps = byKey(await detectRepo(run, repo));
    expect(ps['app.devCommand'].value).toBe('pnpm dev --port {port} --strictPort');
    expect(ps['app.ownerPort']).toMatchObject({ value: 4200, source: 'vite.config.ts' });
  });

  it('leaves the pull request title to Claude, with the files that describe it', async () => {
    const d = await detectRepo(run, repo);
    expect(d.gaps).toEqual([
      { key: 'repo.prTitle', files: ['.github/pull_request_template.md', 'CONTRIBUTING.md'] }
    ]);
  });

  it('proposes nothing for a folder that is not a git repository', async () => {
    const d = await detectRepo(run, mkdtempSync(join(tmpdir(), 'atb-empty-')));
    expect(d).toEqual({ proposals: [], gaps: [] });
  });
});
