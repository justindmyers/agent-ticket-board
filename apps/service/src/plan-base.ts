import { execFile } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

// Planning reads the code of the remote's main branch, not the developer's checkout: the checkout can
// be on another branch, or behind. The board keeps a clone that shares the checkout's git objects
// (no worktree, so the repository's own worktree rules are not involved), and moves it to the
// remote's main branch before each plan.

const git = (cwd: string, args: string[]) =>
  new Promise<string>((resolve, reject) =>
    execFile('git', args, { cwd, encoding: 'utf8', timeout: 120_000 }, (e, out, err) =>
      e
        ? reject(new Error(`git ${args[0]}: ${String(err).trim() || e.message}`))
        : resolve(String(out))
    )
  );

/** The default branch of the remote, like origin/main. */
async function remoteMain(repo: string) {
  const head = await git(repo, [
    'symbolic-ref',
    '--quiet',
    '--short',
    'refs/remotes/origin/HEAD'
  ]).catch(() => '');
  return head.trim() || 'origin/main';
}

/** A read-only copy of the remote's main branch at `dir`, fetched now. Returns `dir`. */
export async function planBase(repo: string, dir: string) {
  const main = await remoteMain(repo);
  const branch = main.replace(/^origin\//, '');
  await git(repo, ['fetch', '--quiet', 'origin', branch]);
  if (!existsSync(join(dir, '.git'))) {
    mkdirSync(dirname(dir), { recursive: true });
    await git(dirname(dir), ['clone', '--quiet', '--shared', '--no-checkout', repo, dir]);
  }
  await git(dir, ['fetch', '--quiet', repo, `+refs/remotes/${main}:refs/remotes/${main}`]);
  await git(dir, ['checkout', '--quiet', '--force', '--detach', main]);
  await git(dir, ['clean', '-fdq']);
  return dir;
}
