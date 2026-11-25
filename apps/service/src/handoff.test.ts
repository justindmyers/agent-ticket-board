import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Flow, Ticket } from '@agent-ticket-board/core';
import { handback, writeHandoff } from './handoff';

const ticket = {
  key: 'PROJ-9',
  summary: 'Version field',
  status: 'In Progress',
  type: 'Story',
  priority: 'Low',
  labels: [],
  points: 1,
  updated: null
} as Ticket;
const flow: Flow = {
  stage: 'testing',
  worktree: '/w/proj-9',
  run: { id: 'r1', state: 'done', stage: 'testing', started: 'x', model: 'm' }
};

describe('writeHandoff', () => {
  it('writes the handoff file and returns the prompt and the worktree', async () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'atb-handoff-')), 'PROJ-9');
    const r = await writeHandoff({ ticket, flow, comments: ['Stricter'], dir, atb: 'atb' });
    expect(r.file).toBe(join(dir, 'handoff.md'));
    expect(r.folder).toBe('/w/proj-9');
    expect(r.prompt).toContain(r.file);
    const text = readFileSync(r.file, 'utf8');
    expect(text).toContain('- Stricter');
    expect(text).toContain(join(dir, 'runs', 'r1', 'messages.jsonl'));
  });
});

describe('handback', () => {
  it('applies the summary and the re-plan flag from the body', () => {
    const f = handback(flow, { summary: 'Fixed it', replan: false }, 'now');
    expect(f.chat?.summary).toBe('Fixed it');
    expect(f.need?.actions[0]?.id).toBe('startTesting');
  });
  it('needs an agent record', () => {
    expect(() => handback(null, { summary: 'x' }, 'now')).toThrow(/no agent record/);
  });
});
