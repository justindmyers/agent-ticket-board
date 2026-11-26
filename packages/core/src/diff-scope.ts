// Scope the findings of a repository check to the lines that the change touched. A check that
// audits whole files reports old code too: a developer fixes what the ticket changes, and the rest
// is not the ticket's work.

export type Ranges = Record<string, [number, number][]>;

/** The changed line ranges of each file, from `git diff -U0` text. A new file has every line. */
export function changedRanges(diff: string): Ranges {
  const out: Ranges = {};
  let file = '';
  for (const line of diff.split('\n')) {
    const f = /^\+\+\+ b\/(.+)$/.exec(line);
    if (f) {
      file = f[1]!;
      out[file] ??= [];
      continue;
    }
    const h = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (h && file) {
      const start = Number(h[1]);
      const count = h[2] === undefined ? 1 : Number(h[2]);
      if (count > 0) {
        out[file]!.push([start, start + count - 1]);
      }
    }
  }
  return out;
}

/** The finding lines look like `- path:line — text`. Only those that touch a changed line stay. */
export function scopeFindings(
  text: string,
  ranges: Ranges,
  whole: Set<string> = new Set()
): string {
  const finding = /^\s*-\s+(\S+?):(\d+)\b/;
  const lines = text.split('\n');
  // Text that has no `path:line` finding is not ours to judge: it passes through as it is.
  if (!lines.some((l) => finding.test(l))) {
    return text;
  }
  const kept = lines.filter((l) => {
    const m = finding.exec(l);
    if (!m) {
      return true;
    }
    const [, path, n] = m;
    const line = Number(n);
    return whole.has(path!) || (ranges[path!] ?? []).some(([a, b]) => line >= a && line <= b);
  });
  // A header and a footer with no finding between them say nothing: drop the report.
  return kept.some((l) => finding.test(l)) ? kept.join('\n') : '';
}
