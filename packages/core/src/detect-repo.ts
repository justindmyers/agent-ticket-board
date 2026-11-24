import { access, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { countBy, maxBy } from 'lodash-es';
import type { Proposal, Run } from './detect';

export type Gap = { key: string; files: string[] };

type Scripts = Record<string, string>;

const LOCKS: [string, string][] = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['bun.lockb', 'bun'],
  ['package-lock.json', 'npm run']
];
const VITE_CONFIGS = ['vite.config.ts', 'vite.config.js', 'vite.config.mjs'];
const PR_DOCS: [string, RegExp][] = [
  ['.github', /^pull_request_template\.md$/i],
  ['', /^contributing\.md$/i],
  ['docs', /^contributing\.md$/i]
];
const BRANCH_PATTERNS: [RegExp, string][] = [
  [/^[a-z]+\/[A-Z][A-Z0-9]+-\d+[-_].+$/, '{type}/{key}-{slug}'],
  [/^[a-z]+\/[A-Z][A-Z0-9]+-\d+$/, '{type}/{key}'],
  [/^[A-Z][A-Z0-9]+-\d+[-_].+$/, '{key}-{slug}']
];
const KEY = /[A-Z][A-Z0-9]+-\d+/;

const exists = (file: string) =>
  access(file).then(
    () => true,
    () => false
  );

const readText = (file: string) => readFile(file, 'utf8').catch(() => null);

const firstExisting = async (dir: string, files: string[]) => {
  for (const f of files) {
    if (await exists(join(dir, f))) {
      return f;
    }
  }
  return null;
};

const proposal = (
  key: string,
  value: unknown,
  source: string,
  confidence: Proposal['confidence']
): Proposal => ({ key, value, source, confidence });

async function remote(run: Run, path: string) {
  const url = await run('git', ['remote', 'get-url', 'origin'], path).catch(() => '');
  const slug = url.trim().match(/[:/]([^/:]+\/[^/]+?)(?:\.git)?$/)?.[1];
  return slug ? [proposal('repo.remote', slug, 'git remote get-url origin', 'high')] : [];
}

async function worktreeScript(path: string, scripts: Scripts, pm: string) {
  const name = Object.keys(scripts).find((s) => /worktree/i.test(s));
  if (name) {
    return [proposal('repo.worktreeScript', `${pm} ${name}`, 'package.json', 'medium')];
  }
  const file = (await readdir(join(path, 'scripts')).catch(() => [])).find((f) =>
    /worktree/i.test(f)
  );
  return file ? [proposal('repo.worktreeScript', `./scripts/${file}`, 'scripts/', 'medium')] : [];
}

async function branchPattern(run: Run, path: string) {
  const out = await run('git', ['branch', '-r', '--format=%(refname:short)'], path).catch(() => '');
  const names = out
    .split('\n')
    .map((b) => b.trim().replace(/^[^/]+\//, ''))
    .filter((b) => KEY.test(b));
  const patterns = names.flatMap((b) =>
    BRANCH_PATTERNS.filter(([re]) => re.test(b)).map(([, p]) => p)
  );
  const best = maxBy(Object.entries(countBy(patterns)), ([, c]) => c);
  if (!best) {
    return [];
  }
  const sure = best[1] >= 3 && best[1] / names.length >= 0.8;
  return [proposal('repo.branch', best[0], 'git branch -r', sure ? 'high' : 'medium')];
}

async function app(path: string, scripts: Scripts, pm: string) {
  if (!scripts.dev) {
    return [];
  }
  const vite = await firstExisting(path, VITE_CONFIGS);
  const flags = vite ? '--port {port} --strictPort' : '--port {port}';
  const sep = pm === 'npm run' ? ' -- ' : ' ';
  const out = [proposal('app.devCommand', `${pm} dev${sep}${flags}`, 'package.json', 'medium')];
  const configPort = vite && (await readText(join(path, vite)))?.match(/port:\s*(\d+)/)?.[1];
  const scriptPort = scripts.dev.match(/--port[= ](\d+)/)?.[1];
  if (configPort) {
    out.push(proposal('app.ownerPort', Number(configPort), vite, 'medium'));
  } else if (scriptPort) {
    out.push(proposal('app.ownerPort', Number(scriptPort), 'package.json', 'medium'));
  } else if (vite) {
    out.push(proposal('app.ownerPort', 5173, 'vite default', 'low'));
  }
  return out;
}

async function prDocs(path: string) {
  const docs = [];
  for (const [dir, re] of PR_DOCS) {
    const hit = (await readdir(join(path, dir)).catch(() => [])).find((f) => re.test(f));
    if (hit) {
      docs.push(dir ? `${dir}/${hit}` : hit);
    }
  }
  const skills = (await readdir(join(path, '.claude', 'skills')).catch(() => []))
    .filter((s) => /pr|pull|commit|git/i.test(s))
    .map((s) => `.claude/skills/${s}/SKILL.md`);
  return [...docs, ...skills];
}

export async function detectRepo(
  run: Run,
  path: string
): Promise<{ proposals: Proposal[]; gaps: Gap[] }> {
  const isRepo = await run('git', ['rev-parse', '--show-toplevel'], path).then(
    () => true,
    () => false
  );
  if (!isRepo) {
    return { proposals: [], gaps: [] };
  }
  const pkg = JSON.parse((await readText(join(path, 'package.json'))) ?? '{}') as {
    scripts?: Scripts;
  };
  const scripts = pkg.scripts ?? {};
  const lock = await firstExisting(
    path,
    LOCKS.map(([f]) => f)
  );
  const pm = LOCKS.find(([f]) => f === lock)?.[1] ?? 'npm run';
  const docs = await prDocs(path);
  return {
    proposals: [
      proposal('repo.path', path, 'chosen folder', 'high'),
      ...(await remote(run, path)),
      ...(await worktreeScript(path, scripts, pm)),
      ...(await branchPattern(run, path)),
      ...(await app(path, scripts, pm))
    ],
    gaps: docs.length ? [{ key: 'repo.prTitle', files: docs }] : []
  };
}
