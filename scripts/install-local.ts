// Builds and installs everything on this computer: the CLI (~/.agent-ticket-board/bin), the VS Code
// extension, and the Claude Code plugin in local scope (sessions in this folder only).
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { writePluginFiles } from './gen-plugin';

const home = process.env.ATB_HOME ?? join(homedir(), '.agent-ticket-board');
const run = (cmd: string, args: string[], cwd = '.') =>
  execFileSync(cmd, args, { cwd, stdio: 'inherit' });

run('pnpm', ['-r', 'build']);

mkdirSync(join(home, 'bin'), { recursive: true });
const cli = join(home, 'bin', 'atb.cjs');
copyFileSync('apps/cli/dist/atb.cjs', cli);
console.log(`CLI: ${cli}`);
// VS Code runs on Electron, not node: the extension starts the service with this node.
writeFileSync(join(home, 'bin', 'env.json'), JSON.stringify({ node: process.execPath, atb: cli }));

// The Claude app's PATH may not include the folder that has node, so the pane uses absolute paths.
writePluginFiles('.', { node: process.execPath, atb: cli });

// Agent sessions that the service starts load this copy of the plugin (the guards).
const plugin = join(home, 'plugin');
rmSync(plugin, { recursive: true, force: true });
cpSync('apps/claude-plugin', plugin, {
  recursive: true,
  filter: (p) => !/node_modules|\/tests\b/.test(p)
});
console.log(`Plugin for agent sessions: ${plugin}`);

// Local scope: the plugin loads only for Claude Code sessions in this folder.
const claude = (...a: string[]) => spawnSync('claude', ['plugin', ...a], { stdio: 'inherit' });
claude('marketplace', 'add', './', '--scope', 'local');
claude('marketplace', 'update', 'agent-ticket-board');
claude('install', 'agent-ticket-board@agent-ticket-board', '--scope', 'local');

run('pnpm', ['--filter', 'agent-ticket-board-vscode', 'package']);
run('code', ['--install-extension', 'apps/vscode/dist/agent-ticket-board.vsix', '--force']);
console.log('VS Code extension: installed. Run "Developer: Reload Window" in VS Code.');
