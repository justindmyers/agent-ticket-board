import type { Flow, Gate, Need } from './types';

// The pre-push gate: the checks of the repository, in the order of its config, then a merge of the
// base branch, then the checks again when the merge changed anything. This file has the parts
// that need no process: the command templates and the next step.

/** Single quotes around one word for `sh -c`. */
export const shellQuote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

export const isTestFile = (p: string) => /\.(test|spec)\.[cm]?[jt]sx?$|(^|\/)__tests__\//.test(p);

/**
 * A check command with its file lists filled in. A command that names a list with no files is
 * skipped: `{tests}` with no changed test has nothing to run.
 */
export function expandCommand(
  cmd: string,
  lists: { changed: string[]; tests: string[] }
): { run: string } | { skip: string } {
  for (const [name, files] of Object.entries(lists)) {
    if (cmd.includes(`{${name}}`) && !files.length) {
      return { skip: `No ${name === 'tests' ? 'changed test files' : 'changed files'}.` };
    }
  }
  const words = (files: string[]) => files.map(shellQuote).join(' ');
  return {
    run: cmd
      .replace('{changed}', () => words(lists.changed))
      .replace('{tests}', () => words(lists.tests))
  };
}

/** The record after a gate run, with the developer's next step. */
export function applyGate(f: Flow, g: Gate): Flow {
  const open = { id: 'openWorktree', label: 'Open worktree' };
  const failed = g.steps.find((s) => !s.ok);
  const need: Need = failed
    ? {
        kind: 'problem',
        ask: `${failed.name} failed.`,
        ...(failed.note ? { detail: failed.note } : {}),
        actions: [{ id: 'startGate', label: 'Run the checks again' }, open]
      }
    : {
        kind: 'decision',
        ask: `Every check passes${g.merged ? ' after the merge' : ''}.`,
        actions: [open]
      };
  return { ...f, gate: g, need };
}
