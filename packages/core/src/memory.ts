import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

// The developer's Claude Code project memory of the repository: rules, fixes and pitfalls that earlier
// chat sessions learned. Claude Code files it by the folder of the session, so a worktree has none of
// it. Each agent run gets the index of the main checkout, and may read the notes.

/** Claude Code's memory folder for a checkout: the path with every other character as '-'. */
export function memoryDir(checkout: string, claudeHome = join(homedir(), '.claude')) {
  return join(claudeHome, 'projects', checkout.replace(/[^a-zA-Z0-9]/g, '-'), 'memory');
}

export type ProjectMemory = { dir: string; index: string };

/** The memory of a checkout, or null when it has no index. */
export function projectMemory(checkout: string, claudeHome?: string): ProjectMemory | null {
  const dir = memoryDir(checkout, claudeHome);
  const file = join(dir, 'MEMORY.md');
  return existsSync(file) ? { dir, index: readFileSync(file, 'utf8').trim() } : null;
}

/** The part of a prompt with the memory index. */
export function memorySection(m: ProjectMemory) {
  return [
    '',
    '# What earlier sessions in this repository learned',
    '',
    "This is the index of the developer's notes from earlier work in this repository. The notes are",
    `in ${m.dir}/<file>. Read the notes that apply to your work before you start: browser checks,`,
    'mocking, screenshots, tests, styles, or the area of the code that you change. They are the',
    "developer's rules and solved problems: follow them over your own habits. Skip notes about other tickets.",
    '',
    m.index
  ].join('\n');
}
