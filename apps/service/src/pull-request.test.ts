import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  utimesSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CONFIG, loadFlow, readTimeline, saveFlow, type Flow } from '@agent-ticket-board/core';
import { describe, expect, it } from 'vitest';
import { doPr, planPr, refreshPr, type Gh } from './pull-request';

const git = (cwd: string, ...a: string[]) =>
  execFileSync('git', ['-c', 'user.name=T', '-c', 'user.email=t@example.com', ...a], {
    cwd,
    encoding: 'utf8',
    stdio: 'pipe'
  }).trim();

let n = 100;
const TEMPLATE =
  '## Description\n\n## What type of change is this?\n\n- [ ] Feature\n- [ ] Bug Fix\n\n## Jira Ticket(s)\n\n## Validation Steps\n';

/** A worktree on a branch with two commits of the ticket, pushed, with two screenshots as evidence. */
async function ticket(o: { template?: boolean; pushed?: boolean } = {}) {
  const key = `PRQ-${n++}`;
  const root = mkdtempSync(join(tmpdir(), 'atb-pr-'));
  const origin = join(root, 'origin.git');
  const wt = join(root, 'wt');
  mkdirSync(origin);
  git(origin, 'init', '--bare', '-b', 'main');
  git(root, 'clone', origin, wt);
  writeFileSync(join(wt, 'base.txt'), 'base\n');
  if (o.template !== false) {
    mkdirSync(join(wt, '.github'));
    writeFileSync(join(wt, '.github', 'pull_request_template.md'), TEMPLATE);
  }
  git(wt, 'add', '.');
  git(wt, 'commit', '-m', 'base');
  git(wt, 'push', 'origin', 'HEAD:main');
  git(wt, 'checkout', '-b', `feature/${key}-edge`);
  for (const [f, title] of [
    ['a.ts', `feat(form): add a field (${key})`],
    ['b.ts', `feat(edges): add update controls (${key})`]
  ] as const) {
    writeFileSync(join(wt, f), `${f}\n`);
    git(wt, 'add', f);
    git(wt, 'commit', '-m', title);
  }
  CONFIG.repo.baseBranch = 'main';
  const shots = join(root, 'shots');
  mkdirSync(shots);
  const shot = (name: string) => {
    writeFileSync(join(shots, name), 'png');
    return join(shots, name);
  };
  const head = git(wt, 'rev-parse', 'HEAD');
  const flow: Flow = {
    stage: 'ship',
    worktree: wt,
    // R1 and R2 show the same view, in two themes. R3 shows another view. R4 has no screenshot.
    requirements: [
      { id: 'R1', text: 'The card shows the version', check: 'c' },
      { id: 'R2', text: 'The card shows the target', check: 'c' },
      { id: 'R3', text: 'The toggle saves', check: 'c' },
      { id: 'R4', text: 'Only admins see it', check: 'c' }
    ],
    evidence: {
      R1: {
        ok: true,
        data: 'real',
        shots: [shot('card-light.png'), shot('card-dark.png'), join(shots, 'gone.png')]
      },
      R2: {
        ok: true,
        data: 'real',
        shots: [join(shots, 'card-light.png'), join(shots, 'card-dark.png')]
      },
      R3: { ok: false, data: 'fake', shots: [shot('toggle.png')] },
      R4: { ok: true, data: 'none' }
    },
    commits: { plan: [], done: [], summary: 'Update controls for the edge.' },
    push: {
      branch: `feature/${key}-edge`,
      head,
      commits: [],
      command: 'git push',
      dryRun: '',
      url: 'https://github.com/acme/web',
      at: 'n',
      ...(o.pushed === false ? {} : { pushedAt: 'p' })
    }
  };
  await saveFlow(key, flow);
  return { key, wt, root, head };
}

type Call = { args: string[]; cwd: string; body?: string; files?: string[] };
/** A gh that records its calls. `create` decides what `gh pr create` does. */
function fakeGh(
  o: { existing?: string; list?: 'fails'; create?: { code: number; out: string } } = {}
) {
  const calls: Call[] = [];
  const gh: Gh = async (args, cwd) => {
    const call: Call = { args, cwd };
    calls.push(call);
    if (args[1] === 'list') {
      return o.list === 'fails'
        ? { code: 1, out: 'gh: not logged in' }
        : { code: 0, out: JSON.stringify(o.existing ? [{ url: o.existing }] : []) };
    }
    call.body = readFileSync(join(cwd, 'body.md'), 'utf8');
    call.files = args.flatMap((a, i) => (args[i - 1] === '--attach' ? [a.split('#')[0]!] : []));
    expect(call.files.every((f) => existsSync(join(cwd, f)))).toBe(true);
    return (
      o.create ?? {
        code: 0,
        out: 'Creating draft pull request\nhttps://github.com/acme/web/pull/7\n'
      }
    );
  };
  return { gh, calls, o };
}

describe('planPr', () => {
  it('builds the title from the commits, the body from the template, and the screenshots that exist', async () => {
    const { key } = await ticket();
    const { gh, calls } = fakeGh();
    const f = await planPr(key, undefined, gh, () => 'now');
    const p = f.prPlan!;
    expect(p.title).toBe(`feat(edges): add update controls (${key})`);
    expect(p.base).toBe('main');
    expect(p.head).toBe(`feature/${key}-edge`);
    expect(p.commits).toBe(2);
    // Four requirements, three views of two themes: two images, one for each view.
    expect(p.attach.map((a) => [a.name, a.alt])).toEqual([
      ['1-card-light.png', 'The card shows the version'],
      ['2-toggle.png', 'The toggle saves']
    ]);
    expect(p.body).toContain('Update controls for the edge.');
    expect(p.body).toContain('- [x] Feature');
    expect(p.body).toContain('- [ ] Bug Fix');
    expect(p.body).toContain(
      '- [x] The card shows the version\n- [x] The card shows the target\n- [ ] The toggle saves (tested with mocked data)\n- [x] Only admins see it'
    );
    expect(p.body).toContain(
      '![The card shows the version](./1-card-light.png)\n\n![The toggle saves](./2-toggle.png)'
    );
    expect(p.body.match(/!\[/g)).toHaveLength(2);
    expect(p.warning).toBeUndefined();
    expect(p.body).not.toContain('/shots/');
    expect(f.need?.actions.map((a) => a.id)).toEqual(['createPr', 'showPr', 'openWorktree']);
    expect((await loadFlow(key))?.prPlan?.title).toBe(p.title);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.args.slice(0, 3)).toEqual(['pr', 'list', '--head']);
    expect((await readTimeline(key)).find((e) => e.type === 'pr.planned')).toMatchObject({
      attach: 2,
      commits: 2
    });
  });
  it('uses a plain template when the repository has none', async () => {
    const { key } = await ticket({ template: false });
    const f = await planPr(key, undefined, fakeGh().gh);
    expect(f.prPlan?.body).toMatch(/^## Description/);
    expect(f.prPlan?.body).toContain('## Validation Steps');
  });
  it('makes nothing and saves nothing when a problem stops it', async () => {
    const a = await ticket({ pushed: false });
    await expect(planPr(a.key, undefined, fakeGh().gh)).rejects.toThrow(/Push the branch first/);
    const b = await ticket();
    await expect(
      planPr(b.key, undefined, fakeGh({ existing: 'https://github.com/acme/web/pull/3' }).gh)
    ).rejects.toThrow(/pull request already/);
    const c = await ticket();
    writeFileSync(join(c.wt, 'late.ts'), 'x\n');
    git(c.wt, 'add', '.');
    git(c.wt, 'commit', '-m', `feat(edges): add a late change (${c.key})`);
    await expect(planPr(c.key, undefined, fakeGh().gh)).rejects.toThrow(/changed after the push/);
    for (const k of [a.key, b.key, c.key]) {
      expect((await loadFlow(k))?.prPlan).toBeUndefined();
    }
  });
  it('stops when GitHub cannot say whether the branch has a pull request', async () => {
    const { key } = await ticket();
    await expect(planPr(key, undefined, fakeGh({ list: 'fails' }).gh)).rejects.toThrow(
      /did not say whether the branch has a pull request/
    );
  });
  it('stops when no commit has the title of the ticket', async () => {
    const { key, wt } = await ticket();
    git(wt, 'reset', '--hard', 'origin/main');
    writeFileSync(join(wt, 'c.ts'), 'c\n');
    git(wt, 'add', '.');
    git(wt, 'commit', '-m', 'wip');
    const head = git(wt, 'rev-parse', 'HEAD');
    const f = (await loadFlow(key))!;
    await saveFlow(key, { ...f, push: { ...f.push!, head } });
    await expect(planPr(key, undefined, fakeGh().gh)).rejects.toThrow(/No commit has a title/);
  });
});

describe('screenshots that are older than the code', () => {
  const age = (root: string, names: string[]) => {
    for (const n of names) {
      utimesSync(join(root, 'shots', n), 1000, 1000);
    }
  };
  it('leaves them all out, attaches nothing, and says to test again', async () => {
    const { key, root } = await ticket();
    age(root, readdirSync(join(root, 'shots')));
    const f = await planPr(key, undefined, fakeGh().gh);
    expect(f.prPlan?.attach).toEqual([]);
    expect(f.prPlan?.body).not.toContain('![');
    expect(f.prPlan?.warning).toMatch(
      /older than the code: [a-z.]+ changed after them\. None are attached\. Run Testing again/
    );
    expect((await readTimeline(key)).find((e) => e.type === 'pr.planned')).toMatchObject({
      attach: 0
    });
  });
  it('leaves out the old ones and keeps the current ones', async () => {
    const { key, root } = await ticket();
    age(root, ['toggle.png']);
    const f = await planPr(key, undefined, fakeGh().gh);
    expect(f.prPlan?.attach.map((a) => a.name)).toEqual(['1-card-light.png']);
    expect(f.prPlan?.warning).toMatch(
      /^1 older screenshot is left out: [a-z.]+ changed after it\.$/
    );
  });
  it('counts a change that was committed, not only one that is waiting to be committed', async () => {
    const { key, root, wt } = await ticket();
    age(root, readdirSync(join(root, 'shots')));
    // The shots are old, and the commits are older still: nothing is waiting in the worktree.
    expect(git(wt, 'status', '--porcelain')).toBe('');
    const f = await planPr(key, undefined, fakeGh().gh);
    expect(f.prPlan?.attach).toEqual([]);
  });
});

describe('updating the pull request that is open', () => {
  const URL = 'https://github.com/acme/web/pull/7';
  /** A ticket whose draft is open. GitHub lists it. */
  async function opened() {
    const t = await ticket();
    await planPr(t.key, undefined, fakeGh().gh, () => 'first');
    await doPr(t.key, undefined, fakeGh().gh, () => 'made');
    return t;
  }
  it('shows the update first, with the title and the body that replace the ones on GitHub', async () => {
    const { key } = await opened();
    const f = await planPr(key, undefined, fakeGh({ existing: URL }).gh, () => 'later');
    expect(f.prPlan).toMatchObject({ update: true, url: URL, createdAt: 'made', at: 'later' });
    expect(f.need?.ask).toBe(`Ready to update the draft pull request ${URL}.`);
    expect(f.need?.actions.map((a) => [a.id, a.label])).toEqual([
      ['createPr', 'Update the pull request'],
      ['showPr', 'Build the preview again'],
      ['openWorktree', 'Open worktree']
    ]);
  });
  it('updates exactly that pull request, as it is, and makes no second one', async () => {
    const { key } = await opened();
    await planPr(key, undefined, fakeGh({ existing: URL }).gh);
    const g = fakeGh({ existing: URL });
    const f = await doPr(key, undefined, g.gh, () => 'updated');
    const edit = g.calls.find((c) => c.args[1] === 'edit')!;
    expect(edit.args.slice(0, 3)).toEqual(['pr', 'edit', URL]);
    expect(edit.args).not.toContain('--draft');
    expect(edit.args).not.toContain('--base');
    expect(edit.args[edit.args.indexOf('-R') + 1]).toBe('acme/web');
    expect(edit.args[edit.args.indexOf('--title') + 1]).toBe(f.prPlan?.title);
    expect(edit.body).toBe(f.prPlan?.body);
    expect(edit.files).toEqual(['./1-card-light.png', './2-toggle.png']);
    expect(g.calls.some((c) => c.args[1] === 'create')).toBe(false);
    expect(f.prPlan).toMatchObject({ url: URL, createdAt: 'made', updatedAt: 'updated' });
    expect(f.prPlan?.update).toBeUndefined();
    expect(f.need?.ask).toBe(`The pull request is updated: ${URL}`);
    expect((await readTimeline(key)).some((e) => e.type === 'pr.updated')).toBe(true);
  });
  it('counts a clean exit of gh as an update, even when it prints nothing', async () => {
    const { key } = await opened();
    await planPr(key, undefined, fakeGh({ existing: URL }).gh);
    const f = await doPr(
      key,
      undefined,
      fakeGh({ existing: URL, create: { code: 0, out: '' } }).gh
    );
    expect(f.prPlan?.url).toBe(URL);
  });
  it('keeps the update and warns when a screenshot did not upload', async () => {
    const { key } = await opened();
    await planPr(key, undefined, fakeGh({ existing: URL }).gh);
    const f = await doPr(
      key,
      undefined,
      fakeGh({ existing: URL, create: { code: 1, out: `failed to upload\n${URL}\n` } }).gh
    );
    expect(f.prPlan?.warning).toMatch(/is updated, but a screenshot did not upload/);
  });
  it('does not touch a pull request that someone else opened', async () => {
    const { key } = await ticket();
    await expect(
      planPr(key, undefined, fakeGh({ existing: 'https://github.com/acme/web/pull/3' }).gh)
    ).rejects.toThrow(/pull request already/);
    const own = await opened();
    await expect(
      planPr(own.key, undefined, fakeGh({ existing: 'https://github.com/acme/web/pull/99' }).gh)
    ).rejects.toThrow(/pull request already/);
  });
  it('refuses to update a pull request that is no longer open', async () => {
    const { key } = await opened();
    await planPr(key, undefined, fakeGh({ existing: URL }).gh);
    const g = fakeGh({});
    await expect(doPr(key, undefined, g.gh)).rejects.toThrow(/no longer open on GitHub/);
    expect(g.calls.some((c) => c.args[1] === 'edit')).toBe(false);
  });
});

describe('refreshPr: the update that the board builds by itself', () => {
  const URL = 'https://github.com/acme/web/pull/7';
  async function opened() {
    const t = await ticket();
    await planPr(t.key, undefined, fakeGh().gh, () => 'first');
    await doPr(t.key, undefined, fakeGh().gh, () => 'made');
    return t;
  }
  /** What a push does to the record: the branch head is the one that was pushed. */
  async function pushed(key: string, wt: string) {
    const f = (await loadFlow(key))!;
    await saveFlow(key, { ...f, push: { ...f.push!, head: git(wt, 'rev-parse', 'HEAD') } });
  }
  const gh = () => fakeGh({ existing: URL }).gh;

  it('shows nothing when title, body and screenshots are what GitHub got', async () => {
    const { key } = await opened();
    const before = await loadFlow(key);
    expect(await refreshPr(key, undefined, gh())).toBeNull();
    expect(await loadFlow(key)).toEqual(before);
  });
  it('shows the update by itself when a new commit changes the title or the body', async () => {
    const { key, wt } = await opened();
    writeFileSync(join(wt, 'c.ts'), 'c\n');
    git(wt, 'add', 'c.ts');
    git(wt, 'commit', '-m', `feat(edges): add the reset control (${key})`);
    await pushed(key, wt);
    const f = await refreshPr(key, undefined, gh(), () => 'auto');
    expect(f?.prPlan).toMatchObject({ update: true, url: URL, at: 'auto', createdAt: 'made' });
    expect(f?.need?.actions[0]?.id).toBe('createPr');
    expect(f?.prPlan?.body).toContain('add the reset control');
    const e = (await readTimeline(key)).filter((x) => x.type === 'pr.planned').at(-1)!;
    expect(e).toMatchObject({ auto: true, update: true });
  });
  it('shows the update when a screenshot file changed, even with the same name', async () => {
    const { key, root } = await opened();
    writeFileSync(join(root, 'shots', 'toggle.png'), 'a new screenshot');
    const f = await refreshPr(key, undefined, gh());
    expect(f?.prPlan?.update).toBe(true);
  });
  it('shows nothing again after the update was made', async () => {
    const { key, root } = await opened();
    writeFileSync(join(root, 'shots', 'toggle.png'), 'a new screenshot');
    await refreshPr(key, undefined, gh());
    await doPr(key, undefined, gh(), () => 'updated');
    expect(await refreshPr(key, undefined, gh())).toBeNull();
  });
  it('takes the waiting update back when the work makes it the same as GitHub', async () => {
    const { key, root } = await opened();
    const file = join(root, 'shots', 'toggle.png');
    const was = statSync(file);
    writeFileSync(file, 'a new screenshot');
    expect((await refreshPr(key, undefined, gh()))?.prPlan?.update).toBe(true);
    writeFileSync(file, 'png');
    utimesSync(file, was.atime, was.mtime);
    const f = await refreshPr(key, undefined, gh());
    expect(f?.prPlan?.update).toBeUndefined();
    expect(f?.need?.actions.some((a) => a.id === 'createPr')).toBeFalsy();
  });
  it('keeps a problem on top of the ticket, but saves the update', async () => {
    const { key, root } = await opened();
    const f0 = (await loadFlow(key))!;
    await saveFlow(key, {
      ...f0,
      need: { kind: 'problem', ask: 'A check fails.', actions: [{ id: 'startGate', label: 'Fix' }] }
    });
    writeFileSync(join(root, 'shots', 'toggle.png'), 'a new screenshot');
    const f = await refreshPr(key, undefined, gh());
    expect(f?.need?.ask).toBe('A check fails.');
    expect(f?.prPlan?.update).toBe(true);
  });
  it("does nothing before the draft is made, off the ship stage, and for another one's pull request", async () => {
    const t = await ticket();
    await planPr(t.key, undefined, fakeGh().gh);
    expect(await refreshPr(t.key, undefined, fakeGh().gh)).toBeNull();
    const { key, root } = await opened();
    writeFileSync(join(root, 'shots', 'toggle.png'), 'a new screenshot');
    expect(
      await refreshPr(
        key,
        undefined,
        fakeGh({ existing: 'https://github.com/acme/web/pull/99' }).gh
      )
    ).toBeNull();
    const f = (await loadFlow(key))!;
    await saveFlow(key, { ...f, stage: 'testing' });
    expect(await refreshPr(key, undefined, gh())).toBeNull();
  });
  it('does nothing, and does not throw, when GitHub does not answer', async () => {
    const { key, root } = await opened();
    writeFileSync(join(root, 'shots', 'toggle.png'), 'a new screenshot');
    expect(await refreshPr(key, undefined, fakeGh({ list: 'fails' }).gh)).toBeNull();
  });
  it('never writes to GitHub', async () => {
    const { key, root } = await opened();
    writeFileSync(join(root, 'shots', 'toggle.png'), 'a new screenshot');
    const g = fakeGh({ existing: URL });
    await refreshPr(key, undefined, g.gh);
    expect(g.calls.every((c) => c.args[1] === 'list')).toBe(true);
  });
});

describe('doPr', () => {
  it('makes exactly the draft that was shown, with its screenshots', async () => {
    const { key } = await ticket();
    await planPr(key, undefined, fakeGh().gh, () => 'then');
    const { gh, calls } = fakeGh();
    const f = await doPr(key, undefined, gh, () => 'now');
    const create = calls.find((c) => c.args[1] === 'create')!;
    expect(create.args.slice(0, 2)).toEqual(['pr', 'create']);
    expect(create.args).toContain('--draft');
    expect(create.args.slice(create.args.indexOf('-R'), create.args.indexOf('-R') + 2)).toEqual([
      '-R',
      'acme/web'
    ]);
    expect(create.args[create.args.indexOf('--base') + 1]).toBe('main');
    expect(create.args[create.args.indexOf('--head') + 1]).toBe(`feature/${key}-edge`);
    expect(create.args[create.args.indexOf('--title') + 1]).toBe(
      `feat(edges): add update controls (${key})`
    );
    expect(create.args[create.args.indexOf('--body-file') + 1]).toBe('body.md');
    expect(create.files).toEqual(['./1-card-light.png', './2-toggle.png']);
    expect(create.args).toContain('./1-card-light.png#The card shows the version');
    expect(create.body).toBe(f.prPlan!.body);
    expect(create.args).not.toContain('--no-verify');
    expect(f.prPlan).toMatchObject({ createdAt: 'now', url: 'https://github.com/acme/web/pull/7' });
    expect(f.need?.ask).toBe('The draft pull request is open: https://github.com/acme/web/pull/7');
    expect(existsSync(create.cwd)).toBe(false);
    expect((await readTimeline(key)).find((e) => e.type === 'pr.created')).toMatchObject({
      url: 'https://github.com/acme/web/pull/7',
      attached: 2
    });
  });
  it('keeps the address and warns when a screenshot did not upload', async () => {
    const { key } = await ticket();
    await planPr(key, undefined, fakeGh().gh);
    const f = await doPr(
      key,
      undefined,
      fakeGh({
        create: {
          code: 1,
          out: 'failed to upload 2-toggle.png\nhttps://github.com/acme/web/pull/9\n'
        }
      }).gh
    );
    expect(f.prPlan?.url).toBe('https://github.com/acme/web/pull/9');
    expect(f.prPlan?.warning).toMatch(/screenshot did not upload/);
  });
  it('says so, and records nothing, when GitHub made no pull request', async () => {
    const { key } = await ticket();
    await planPr(key, undefined, fakeGh().gh);
    await expect(
      doPr(key, undefined, fakeGh({ create: { code: 1, out: 'GraphQL: not allowed' } }).gh)
    ).rejects.toThrow(/did not make the pull request[\s\S]*not allowed/);
    expect((await loadFlow(key))?.prPlan?.createdAt).toBeUndefined();
    expect((await readTimeline(key)).some((e) => e.type === 'pr.failed')).toBe(true);
  });
  it('wants the pull request to be shown first, and makes one only once', async () => {
    const { key } = await ticket();
    await expect(doPr(key, undefined, fakeGh().gh)).rejects.toThrow(/Show the pull request first/);
    await planPr(key, undefined, fakeGh().gh);
    await doPr(key, undefined, fakeGh().gh);
    const again = fakeGh();
    await expect(doPr(key, undefined, again.gh)).rejects.toThrow(/open already/);
    expect(again.calls).toHaveLength(0);
  });
  it('refuses when the branch changed after it was shown, or a pull request appeared', async () => {
    const a = await ticket();
    await planPr(a.key, undefined, fakeGh().gh);
    writeFileSync(join(a.wt, 'late.ts'), 'x\n');
    git(a.wt, 'add', '.');
    git(a.wt, 'commit', '-m', `feat(edges): add a late change (${a.key})`);
    const g1 = fakeGh();
    await expect(doPr(a.key, undefined, g1.gh)).rejects.toThrow(/changed after the push/);
    expect(g1.calls.some((c) => c.args[1] === 'create')).toBe(false);
    const b = await ticket();
    await planPr(b.key, undefined, fakeGh().gh);
    const g2 = fakeGh({ existing: 'https://github.com/acme/web/pull/5' });
    await expect(doPr(b.key, undefined, g2.gh)).rejects.toThrow(/pull request already/);
    expect(g2.calls.some((c) => c.args[1] === 'create')).toBe(false);
  });
});
