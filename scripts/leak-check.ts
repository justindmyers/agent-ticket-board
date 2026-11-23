// Leak check: finds private words (employer, people, project keys) and secrets before a commit.
// The deny list stays outside the repository: ~/.agent-ticket-board/denylist.txt (one regex per line),
// or the file in ATB_DENYLIST. CI has no deny list, so CI runs only gitleaks.
//   pnpm leak-check            all tracked and new files
//   pnpm leak-check --staged   staged files only (the pre-commit hook)
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export type Leak = { file: string; line: number; pattern: string; text: string };

export function parseDenyList(text: string): RegExp[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => new RegExp(l, 'i'));
}

export function findLeaks(files: { path: string; text: string }[], patterns: RegExp[]): Leak[] {
  const leaks: Leak[] = [];
  for (const f of files) {
    for (const p of patterns) {
      if (p.test(f.path)) {
        leaks.push({ file: f.path, line: 0, pattern: p.source, text: f.path });
      }
    }
    f.text.split('\n').forEach((line, i) => {
      for (const p of patterns) {
        if (p.test(line)) {
          leaks.push({
            file: f.path,
            line: i + 1,
            pattern: p.source,
            text: line.trim().slice(0, 120)
          });
        }
      }
    });
  }
  return leaks;
}

const isBinary = (buf: Buffer) => buf.subarray(0, 8000).includes(0);

function listFiles(staged: boolean): string[] {
  const git = (...a: string[]) =>
    execFileSync('git', a, { encoding: 'utf8' }).split('\n').filter(Boolean);
  if (staged) {
    return git('diff', '--cached', '--name-only', '--diff-filter=ACMR');
  }
  return [...git('ls-files'), ...git('ls-files', '--others', '--exclude-standard')];
}

function main() {
  const staged = process.argv.includes('--staged');
  const listFile =
    process.env.ATB_DENYLIST ?? join(homedir(), '.agent-ticket-board', 'denylist.txt');
  const patterns = existsSync(listFile) ? parseDenyList(readFileSync(listFile, 'utf8')) : [];
  if (!patterns.length) {
    console.warn(`leak-check: no deny list at ${listFile}. Only gitleaks runs.`);
  }
  const files = listFiles(staged)
    .filter((p) => existsSync(p))
    .map((p) => ({ path: p, buf: readFileSync(p) }))
    .filter((f) => !isBinary(f.buf))
    .map((f) => ({ path: f.path, text: f.buf.toString('utf8') }));
  const leaks = findLeaks(files, patterns);
  for (const l of leaks) {
    console.error(`${l.file}:${l.line}  /${l.pattern}/  ${l.text}`);
  }

  const gitleaks = spawnSync(
    'gitleaks',
    staged ? ['git', '--staged', '--no-banner'] : ['dir', '.', '--no-banner'],
    {
      stdio: 'inherit'
    }
  );
  if (gitleaks.error) {
    console.warn('leak-check: gitleaks is not installed. Install it to scan for secrets.');
  }
  const secrets = gitleaks.status !== null && gitleaks.status !== 0;
  if (leaks.length || secrets) {
    console.error(
      `leak-check: FAILED (${leaks.length} deny-list matches${secrets ? ', gitleaks findings' : ''}).`
    );
    process.exit(1);
  }
  console.log(`leak-check: ${files.length} files clean.`);
}

if (process.argv[1]?.endsWith('leak-check.ts')) {
  main();
}
