import type { Flow, Gate, Need } from './types';

// The pre-push gate: the checks of the repository, in the order of its config, then a merge of the
// base branch, then the checks again when the merge changed anything. This file has the parts
// that need no process: the command templates and the next step.

/** Single quotes around one word for `sh -c`. */
export const shellQuote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

export const isTestFile = (p: string) => /\.(test|spec)\.[cm]?[jt]sx?$|(^|\/)__tests__\//.test(p);

/**
 * A check command with its file lists filled in. `{changed}` and `{tests}` are the changed files and
 * the changed test files. `{atb}` is the command of the board CLI, for `{atb} diff-scope`. `{tests:apps/nq/}` is only the files under that folder, with the folder
 * cut off: a tool that runs inside a package needs paths from the package. A list with no files
 * skips the command: a package with no changed test has nothing to run.
 */
export function expandCommand(
  cmd: string,
  lists: { changed: string[]; tests: string[] },
  atb = ''
): { run: string } | { skip: string } {
  let skip = '';
  const run = cmd
    .replaceAll('{atb}', () => atb)
    .replace(
      /\{(changed|tests)(?::([^}]*))?\}/g,
      (_m, name: 'changed' | 'tests', prefix?: string) => {
        const files = lists[name]
          .filter((p) => !prefix || p.startsWith(prefix))
          .map((p) => (prefix ? p.slice(prefix.length) : p));
        if (!files.length && !skip) {
          const what = name === 'tests' ? 'changed test files' : 'changed files';
          skip = `No ${what}${prefix ? ` in ${prefix}` : ''}.`;
        }
        return files.map(shellQuote).join(' ');
      }
    );
  return skip ? { skip } : { run };
}

/** The record after a gate run, with the developer's next step. */
export function applyGate(f: Flow, g: Gate): Flow {
  const open = { id: 'openWorktree', label: 'Open worktree' };
  const failed = g.steps.find((s) => !s.ok);
  const again = g.verify ? 'startVerify' : 'startGate';
  const need: Need = failed
    ? {
        kind: 'problem',
        ask: `${failed.name} failed.`,
        ...(failed.note ? { detail: failed.note } : {}),
        actions: g.verify
          ? [
              { id: 'startCodeReview', label: 'Fix and review again' },
              { id: again, label: 'Run the checks again' },
              open
            ]
          : [{ id: again, label: 'Run the checks again' }, open]
      }
    : g.verify
      ? {
          kind: 'decision',
          ask: 'Every check passes on the change.',
          actions: [{ id: 'startCommitPlan', label: 'Plan the commits' }, open]
        }
      : {
          kind: 'decision',
          ask: `Every check passes${g.merged ? ' after the merge' : ''}.`,
          actions: [open]
        };
  return { ...f, gate: g, need };
}

/** The checks that the board ran after the last review and that failed: the agent fixes them first. */
export function failedChecksSection(f: Flow) {
  const failed = (f.gate?.steps ?? []).filter((s) => !s.ok);
  return failed.length
    ? [
        '',
        '# Checks that failed',
        'The board ran the repository checks on your last change. These failed. Fix their cause before anything else,',
        'then run the same check again to prove the fix.',
        ...failed.map((s) => `- ${s.name}${s.note ? `\n${s.note}` : ''}`)
      ]
    : [];
}
