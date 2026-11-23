import { describe, expect, it } from 'vitest';
import { findLeaks, parseDenyList } from './leak-check';

describe('leak check', () => {
  const patterns = parseDenyList('# comment\n\nacme\n\\bXYZ-[0-9]+\n');

  it('ignores comments and blank lines', () => {
    expect(patterns.map((p) => p.source)).toEqual(['acme', '\\bXYZ-[0-9]+']);
  });

  it('finds a word in any case, with the line number', () => {
    const leaks = findLeaks([{ path: 'a.ts', text: 'ok\nconst x = "ACME corp"' }], patterns);
    expect(leaks).toMatchObject([{ file: 'a.ts', line: 2, pattern: 'acme' }]);
  });

  it('finds a private ticket key but not an invented one', () => {
    expect(findLeaks([{ path: 'b.md', text: 'See XYZ-123 and PROJ-1' }], patterns)).toHaveLength(1);
  });

  it('checks file paths too', () => {
    expect(findLeaks([{ path: 'docs/acme-notes.md', text: '' }], patterns)[0].line).toBe(0);
  });
});
