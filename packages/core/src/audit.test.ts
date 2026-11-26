import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { beforeAll, describe, expect, it } from 'vitest';

// A temporary home, set before core computes its paths.
const home = mkdtempSync(join(tmpdir(), 'atb-audit-'));
process.env.ATB_HOME = home;

let a: typeof import('./audit');

beforeAll(async () => {
  a = await import('./audit');
});

const dir = (key: string) => join(home, 'tickets', key);

describe('audit', () => {
  it('appends one line for each event, with the time, the source and the type', async () => {
    await a.audit('PROJ-1', 'developer', 'answer', { n: 1, text: 'Yes' });
    await a.audit('PROJ-1', 'service', 'run.queued');
    const events = await a.readTimeline('PROJ-1');
    expect(events).toEqual([
      { at: expect.any(String), source: 'developer', type: 'answer', n: 1, text: 'Yes' },
      { at: expect.any(String), source: 'service', type: 'run.queued' }
    ]);
  });

  it('keeps the message and the stack of an error', () => {
    const e = new Error('Boom');
    expect(a.errorData(e)).toEqual({ error: 'Boom', stack: expect.stringContaining('Boom') });
    expect(a.errorData('plain')).toEqual({ error: 'plain' });
  });
});

describe('recordChanges', () => {
  it('lists the top-level fields that changed, with the values before and after', () => {
    expect(
      a.recordChanges(
        { stage: 'planning', need: { kind: 'decision', ask: 'A', actions: [] } },
        { stage: 'planning', steps: [] }
      )
    ).toEqual([
      { field: 'need', before: { kind: 'decision', ask: 'A', actions: [] }, after: undefined },
      { field: 'steps', before: undefined, after: [] }
    ]);
    expect(a.recordChanges(null, { stage: 'planning' })).toEqual([
      { field: 'stage', before: undefined, after: 'planning' }
    ]);
  });
});

describe('RunLog', () => {
  it('writes the prompt, the options without secrets, each message, the raw output and a summary', async () => {
    const log = await a.RunLog.open('PROJ-2', 'r1');
    const loop: Record<string, unknown> = {};
    loop.self = loop;
    await log.prompt('Plan this.', {
      model: 'sonnet',
      env: { TOKEN: 'secret' },
      abortController: new AbortController(),
      spawnClaudeCodeProcess: () => null,
      mcpServers: { board: { instance: loop } }
    });
    await log.message({ type: 'system', subtype: 'init' });
    await log.message({ type: 'result', subtype: 'success' });
    await log.output({ questions: ['raw'] });
    await log.summary({ state: 'done', cost: 0.1 });
    const run = join(dir('PROJ-2'), 'runs', 'r1');
    expect(readFileSync(join(run, 'prompt.md'), 'utf8')).toBe('Plan this.');
    expect(JSON.parse(readFileSync(join(run, 'options.json'), 'utf8'))).toEqual({
      model: 'sonnet',
      mcpServers: ['board']
    });
    expect(readFileSync(join(run, 'messages.jsonl'), 'utf8').trim().split('\n')).toHaveLength(2);
    expect(JSON.parse(readFileSync(join(run, 'output.json'), 'utf8'))).toEqual({
      questions: ['raw']
    });
    expect(JSON.parse(readFileSync(join(run, 'summary.json'), 'utf8'))).toEqual({
      state: 'done',
      cost: 0.1
    });
    expect(log.stderr).toBe(join(run, 'stderr.log'));
  });
});

describe('timelineText', () => {
  it('draws one line for each event, oldest first, with the details', () => {
    const text = a.timelineText([
      { at: '2026-01-01T10:00:00.000Z', source: 'service', type: 'run.started', run: 'r1' },
      {
        at: '2026-01-01T10:01:00.000Z',
        source: 'service',
        type: 'run.failed',
        error: 'Boom',
        stack: 'x'
      }
    ]);
    expect(text.split('\n')).toEqual([
      '2026-01-01 10:00:00  service    run.started  run=r1',
      '2026-01-01 10:01:00  service    run.failed  error=Boom'
    ]);
  });

  it('says what a record change did, not only which field changed', () => {
    const run = { state: 'running', model: 'opus', activity: 'Reading a.ts' };
    const rec = (changes: unknown[]) => ({
      at: '2026-01-01T10:00:00.000Z',
      source: 'service' as const,
      type: 'record',
      fields: changes.map((c) => (c as { field: string }).field),
      changes
    });
    const text = a.timelineText([
      rec([{ field: 'run', before: run, after: { ...run, activity: 'Running pnpm test' } }]),
      rec([{ field: 'run', before: run, after: { ...run, state: 'done' } }]),
      rec([{ field: 'stage', before: 'testing', after: 'code-review' }]),
      rec([{ field: 'need', before: { ask: 'A' }, after: undefined }])
    ]);
    expect(text.split('\n').map((l) => l.slice(32))).toEqual([
      'record  run.activity=Running pnpm test',
      'record  run.state=done',
      'record  stage=code-review',
      'record  need.ask=(removed)'
    ]);
    expect(text).not.toContain('fields=');
  });
});

describe('redact', () => {
  it('removes tokens and keys, and keeps the rest of the text', () => {
    const text = [
      'authorization: Bearer abc.def-123',
      'gh ghp_' + 'a'.repeat(36),
      'key sk-ant-' + 'b'.repeat(30),
      'jira ATATT' + 'c'.repeat(40),
      '{"token":"' + 'd'.repeat(64) + '"}',
      'the plan is fine'
    ].join('\n');
    const out = a.redact(text);
    expect(out).not.toMatch(/abc\.def|aaaa|bbbb|cccc|dddd/);
    expect(out).toContain('the plan is fine');
    expect(out.match(/\[redacted\]/g)).toHaveLength(5);
  });
});

describe('bundle', () => {
  it('packs the ticket folder into one archive, with tokens removed', async () => {
    await a.audit('PROJ-3', 'service', 'note', { header: 'Bearer secret-token-1' });
    const file = await a.bundle('PROJ-3');
    expect(statSync(file).size).toBeGreaterThan(0);
    const listing = execFileSync('tar', ['-tzf', file], { encoding: 'utf8' });
    expect(listing).toContain('PROJ-3/events.jsonl');
    const content = execFileSync('tar', ['-xzOf', file, 'PROJ-3/events.jsonl'], {
      encoding: 'utf8'
    });
    expect(content).not.toContain('secret-token-1');
  });
});

describe('pruneRuns', () => {
  it('removes the oldest runs first until the folder is under the cap', async () => {
    for (const id of ['r1', 'r2', 'r3']) {
      const log = await a.RunLog.open('PROJ-4', id);
      await log.prompt('x'.repeat(1000), {});
      await new Promise((r) => setTimeout(r, 15));
    }
    writeFileSync(join(dir('PROJ-4'), 'events.jsonl'), '');
    const removed = await a.pruneRuns('PROJ-4', 2100);
    expect(removed).toEqual(['r1']);
    expect(await readdir(join(dir('PROJ-4'), 'runs'))).toEqual(['r2', 'r3']);
  });
});
