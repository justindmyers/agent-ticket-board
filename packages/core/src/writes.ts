// Writes to the backend during Testing. The plan lists every write that a test must make; moving the
// ticket to Testing approves the list. The test browser lets only those through.

export type Write = { method: 'POST' | 'PUT' | 'PATCH' | 'DELETE'; path: string; why: string };

/**
 * A regular expression source for a request path: `:name`, `{name}` and `<name>` segments match one
 * segment. It matches at the end of the path, so a proxy prefix (like /api-proxy/) does not matter.
 */
export function writePattern(path: string) {
  const parts = path
    .replace(/[?#].*$/, '')
    .split('/')
    .map((s) =>
      /^(:\w+|\{\w+\}|<\w+>)$/.test(s) ? '[^/]+' : s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    );
  return `${parts.join('/')}(?:[?#].*)?$`;
}
