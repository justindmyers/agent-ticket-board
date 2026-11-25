import { describe, expect, it } from 'vitest';
import { applyHandback, chatPrompt, handoffText } from './handoff';
import type { Flow } from './types';

const t = {
  key: 'PROJ-9',
  summary: 'Version field',
  status: 'In Progress',
  type: 'Story',
  priority: 'Low',
  labels: [],
  points: 1,
  updated: null,
  description: 'Make it strict.'
};
const tested: Flow = {
  stage: 'testing',
  worktree: '/w/proj-9',
  requirements: [
    { id: 'R1', text: 'A version field', check: 'Type a version' },
    { id: 'R2', text: 'Save works', check: 'Click save' }
  ],
  evidence: { R1: { ok: true, seen: 'Field shows' }, R2: { ok: false, note: 'Save 403' } },
  steps: [{ n: 1, text: 'Add the field', covers: ['R1'], state: 'done', note: '' }],
  assumptions: ['Semver only'],
  writes: [{ method: 'PUT', path: '/api/edges/:id', why: 'R2 saves' }],
  need: { kind: 'problem', ask: 'R2 does not pass.', detail: 'R2: Save 403.', actions: [] },
  run: { state: 'done', stage: 'testing', started: 'x', model: 'sonnet' }
};
const ctx = {
  atb: '/bin/node /bin/atb.cjs',
  transcript: '/runs/r9/messages.jsonl',
  comments: ['Narrower field please']
};

describe('handoffText', () => {
  const h = handoffText(t as never, tested, ctx);
  it('has the ticket, the stage, what the board needs and the worktree', () => {
    expect(h).toContain('# PROJ-9: Version field');
    expect(h).toContain('Stage: Testing');
    expect(h).toContain('R2 does not pass.');
    expect(h).toContain('/w/proj-9');
  });
  it('has the requirements with their evidence, the steps, assumptions, writes and comments', () => {
    expect(h).toContain('- R1 (passes): A version field');
    expect(h).toContain('- R2 (does not pass: Save 403): Save works');
    expect(h).toContain('1. [done] Add the field');
    expect(h).toContain('- Semver only');
    expect(h).toContain('- PUT /api/edges/:id: R2 saves');
    expect(h).toContain('- Narrower field please');
    expect(h).toContain('/runs/r9/messages.jsonl');
  });
  it('says how to use the test browser and how to hand back', () => {
    expect(h).toContain('pnpm exec playwright-cli -s=atb-PROJ-9');
    expect(h).toContain('/bin/node /bin/atb.cjs handback PROJ-9 "<what changed and why>"');
    expect(h).toMatch(/--replan/);
    expect(h).toMatch(/Do not commit or push/);
  });
});

describe('chatPrompt', () => {
  it('is one short line that points at the handoff file', () => {
    const p = chatPrompt('PROJ-9', '/h/tickets/PROJ-9/handoff.md');
    expect(p).toBe(
      'Read /h/tickets/PROJ-9/handoff.md and continue the ticket PROJ-9 from there with me.'
    );
  });
});

describe('applyHandback', () => {
  it('shows what changed in chat and the next step of the stage', () => {
    const f = applyHandback(tested, 'Narrowed the field and fixed the 403', false, 'now');
    expect(f.chat).toEqual({ at: 'now', summary: 'Narrowed the field and fixed the 403' });
    expect(f.need?.ask).toBe('Changed in chat: Narrowed the field and fixed the 403');
    expect(f.need?.actions[0]?.id).toBe('startTesting');
    expect(f.stage).toBe('testing');
  });
  it('sends the ticket to Planning as a change when the requirements changed', () => {
    const f = applyHandback(
      { ...tested, steps: [{ n: 1, text: 'a', covers: ['R1'], state: 'done' }] },
      'Use a version list',
      true,
      'now'
    );
    expect(f.stage).toBe('planning');
    expect(f.changes?.at(-1)?.text).toBe('Use a version list');
    expect(f.need?.actions[0]?.id).toBe('replan');
  });
  it('gives each stage its own next step', () => {
    expect(
      applyHandback({ ...tested, stage: 'development' }, 's', false, 'now').need?.actions[0]?.id
    ).toBe('startDevelopment');
    expect(
      applyHandback({ stage: 'planning', requirements: [] }, 's', false, 'now').need?.actions[0]?.id
    ).toBe('replan');
  });
  it('refuses an empty summary', () => {
    expect(() => applyHandback(tested, ' ', false, 'now')).toThrow(/Say what changed/);
  });
});
