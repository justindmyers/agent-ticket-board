// Type-checks the Claude Code plugin against the declarations that Claude Code writes for the
// installed version. Claude Code writes them, gitignored, when it loads the plugin from its folder in
// an interactive session. Without them (a fresh clone, CI), this check says how to get them and skips.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const plugin = join(import.meta.dirname, '..', 'apps', 'claude-plugin');
const types = join(plugin, '.claude-plugin', 'types', 'claude-code', 'index.d.ts');

if (!existsSync(types)) {
  console.log(
    'Plugin type check skipped: no Claude Code types yet. Run `claude --plugin-dir apps/claude-plugin` once, then exit.'
  );
  process.exit(0);
}
// The plugin imports generated copies of core modules: write them first.
const gen = spawnSync('pnpm', ['exec', 'tsx', join(import.meta.dirname, 'gen-plugin.ts')], {
  cwd: plugin,
  stdio: 'inherit'
});
if (gen.status !== 0) {
  process.exit(gen.status ?? 1);
}
const tsc = spawnSync('pnpm', ['exec', 'tsc', '-p', plugin, '--noEmit'], { stdio: 'inherit' });
process.exit(tsc.status ?? 1);
