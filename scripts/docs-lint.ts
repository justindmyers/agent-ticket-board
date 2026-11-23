// Docs lint: checks the project docs with the vendored ASD-STE100 linter (Simplified Technical English).
// Fails when a file has hard violations. Needs python3.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const LINTER = 'skills/asd-ste100/scripts/ste-lint.py';
const ROOT_DOCS = [
  'README.md',
  'CLAUDE.md',
  'PLAN.md',
  'ROADMAP.md',
  'PRODUCT.md',
  'DESIGN.md',
  'CONTRIBUTING.md'
];

const docs = [
  ...ROOT_DOCS.filter((f) => existsSync(f)),
  ...(existsSync('docs')
    ? readdirSync('docs')
        .filter((f) => f.endsWith('.md'))
        .map((f) => join('docs', f))
    : [])
];

let failed = 0;
for (const file of docs) {
  const r = spawnSync('python3', [LINTER, file], { encoding: 'utf8' });
  const summary =
    r.stdout
      .trim()
      .split('\n')
      .filter((l) => /violations/.test(l))
      .pop() ?? r.stderr.trim();
  console.log(`${r.status === 0 ? 'ok  ' : 'FAIL'} ${file}: ${summary}`);
  if (r.status !== 0) {
    failed++;
    console.log(r.stdout);
  }
}
if (failed) {
  process.exit(1);
}
