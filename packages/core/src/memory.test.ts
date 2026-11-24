import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { memoryDir, memorySection, projectMemory } from './memory';

describe('project memory', () => {
  it("finds Claude Code's memory folder of the main checkout, not of the worktree", () => {
    expect(memoryDir('/Users/dev/Projects/web-app', '/h/.claude')).toBe(
      '/h/.claude/projects/-Users-dev-Projects-web-app/memory'
    );
    expect(memoryDir('/a/b.c_d', '/h/.claude')).toBe('/h/.claude/projects/-a-b-c-d/memory');
  });
  it('reads the index when the folder has one, and nothing otherwise', () => {
    const home = mkdtempSync(join(tmpdir(), 'atb-claude-'));
    expect(projectMemory('/x/app', home)).toBeNull();
    const dir = memoryDir('/x/app', home);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'MEMORY.md'),
      '# Memory Index\n- [Mocks](feedback_mocks.md) — reuse mock.js\n'
    );
    expect(projectMemory('/x/app', home)).toEqual({
      dir,
      index: expect.stringContaining('feedback_mocks.md')
    });
  });
  it('gives the agent the index, where the notes are, and that they come first', () => {
    const s = memorySection({
      dir: '/m',
      index: '# Memory Index\n- [Mocks](feedback_mocks.md) — reuse'
    });
    expect(s).toContain('# What earlier sessions in this repository learned');
    expect(s).toContain('/m/<file>');
    expect(s).toMatch(/Read the notes that apply to your work before you start/);
    expect(s).toMatch(/follow them over your own habits/);
    expect(s).toContain('- [Mocks](feedback_mocks.md) — reuse');
  });
});
