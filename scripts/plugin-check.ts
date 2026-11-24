// Type-checks the Claude Code plugin with `claude plugin validate`. The plugin is outside the pnpm
// typecheck (its hooks run in their own environment), and validate reports type errors as warnings.
import { spawnSync } from 'node:child_process';

const r = spawnSync('claude', ['plugin', 'validate', 'apps/claude-plugin'], { encoding: 'utf8' });
const output = `${r.stdout ?? ''}${r.stderr ?? ''}`;
const errors = output.split('\n').filter((line) => /error TS\d+/.test(line));

if (r.status !== 0 || errors.length) {
  console.error(errors.length ? errors.join('\n') : output);
  console.error(`plugin-check: ${errors.length} type errors in the Claude Code plugin.`);
  process.exit(1);
}
console.log('plugin-check: the Claude Code plugin has no type errors.');
