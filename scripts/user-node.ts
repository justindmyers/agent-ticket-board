import { spawnSync } from 'node:child_process';

/** The last line of shell output that is an absolute path to a node executable, or the fallback. */
export function pickNode(out: string, fallback: string) {
  const lines = out
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^\/\S*\/node$/.test(l));
  return lines.at(-1) ?? fallback;
}

/**
 * The developer's own node: the one that their login shell finds. The installer may run under
 * another node (an editor's or a tool's), and the board must not depend on it.
 */
export function userNode(fallback = process.execPath) {
  const shell = process.env.SHELL || '/bin/zsh';
  const r = spawnSync(shell, ['-ilc', 'command -v node'], { encoding: 'utf8', timeout: 15_000 });
  return pickNode(r.stdout ?? '', fallback);
}
