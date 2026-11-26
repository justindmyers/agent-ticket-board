import { describe, expect, it } from 'vitest';
import { changedRanges, scopeFindings } from './diff-scope';

const diff = [
  'diff --git a/lib/a.ts b/lib/a.ts',
  '--- a/lib/a.ts',
  '+++ b/lib/a.ts',
  '@@ -3,0 +4,2 @@ context',
  '@@ -20 +22 @@',
  '@@ -30,2 +31,0 @@',
  'diff --git a/lib/b.ts b/lib/b.ts',
  '--- /dev/null',
  '+++ b/lib/b.ts',
  '@@ -0,0 +1,5 @@'
].join('\n');

describe('changedRanges', () => {
  it('reads the new-side ranges of each file, and skips a pure deletion', () => {
    expect(changedRanges(diff)).toEqual({
      'lib/a.ts': [
        [4, 5],
        [22, 22]
      ],
      'lib/b.ts': [[1, 5]]
    });
  });
});

describe('scopeFindings', () => {
  const report = [
    'Comment bloat:',
    '- lib/a.ts:4 — 10-line block comment (max 3).',
    '- lib/a.ts:27 — 4-line block comment (max 3).',
    '- lib/b.ts:2 — 5-line block comment (max 3).',
    'Default to no comment.'
  ].join('\n');

  it('keeps the findings on changed lines, with the header and the footer', () => {
    const out = scopeFindings(report, changedRanges(diff));
    expect(out).toContain('lib/a.ts:4');
    expect(out).toContain('lib/b.ts:2');
    expect(out).not.toContain('lib/a.ts:27');
    expect(out).toContain('Comment bloat:');
    expect(out).toContain('Default to no comment.');
  });

  it('drops the whole report when no finding touches a changed line', () => {
    expect(scopeFindings(report, { 'lib/a.ts': [[100, 101]] })).toBe('');
  });

  it('passes a text that it does not read through unchanged: a plain finding is never hidden', () => {
    expect(scopeFindings('No comment-bloat findings.', {})).toBe('No comment-bloat findings.');
    expect(scopeFindings('- Use react-aria, not headlessui.', {})).toBe(
      '- Use react-aria, not headlessui.'
    );
  });

  it('counts every line of a file that is whole', () => {
    expect(scopeFindings('- c.ts:9 — x', {}, new Set(['c.ts']))).toBe('- c.ts:9 — x');
  });
});
