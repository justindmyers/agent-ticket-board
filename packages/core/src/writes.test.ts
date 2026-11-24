import { describe, expect, it } from 'vitest';
import { applyPlan, parsePlan, PLAN_SCHEMA, planPrompt } from './planning';
import { testPrompt } from './testing';
import { writePattern } from './writes';

const t = {
  key: 'PROJ-9',
  summary: 'S',
  status: 'To Do',
  type: 'Story',
  priority: 'Low',
  labels: [],
  points: 1,
  updated: null,
  description: ''
};
const plan = {
  requirements: [{ id: 'R1', text: 'x', check: 'y' }],
  questions: [],
  assumptions: [],
  steps: [{ text: 'a', covers: ['R1'] }],
  writes: [
    {
      method: 'PUT',
      path: '/api/edges/:id/update-settings',
      why: 'R1 saves the auto-update toggle'
    }
  ]
};

describe('writes to the backend', () => {
  it('are part of every plan, and the record keeps them', () => {
    expect(PLAN_SCHEMA.required).toContain('writes');
    const f = applyPlan({ stage: 'planning' }, parsePlan(plan));
    expect(f.writes).toEqual(plan.writes);
  });
  it('are asked for in the plan prompt, with the approval rule', () => {
    expect(planPrompt(t as never, [])).toMatch(/Moving the ticket to Testing approves this list/);
  });
  it('are listed for the test agent, with what happens to other writes', () => {
    const p = testPrompt(t as never, { stage: 'testing', writes: plan.writes } as never, [], {
      url: 'u',
      session: 's',
      shots: 'x',
      commands: []
    });
    expect(p).toContain('- PUT /api/edges/:id/update-settings: R1 saves the auto-update toggle');
    expect(p).toMatch(/Any other write gets 403/);
    const none = testPrompt(t as never, { stage: 'testing' } as never, [], {
      url: 'u',
      session: 's',
      shots: 'x',
      commands: []
    });
    expect(none).toMatch(/No writes to the backend are approved/);
  });
  it('match a request path with ids, also behind a proxy prefix', () => {
    const re = new RegExp(writePattern('/api/edges/:id/update-settings'));
    expect(re.test('/api-proxy/api/edges/e1/update-settings')).toBe(true);
    expect(re.test('/api/edges/e1/update-settings?x=1')).toBe(true);
    expect(re.test('/api/edges/e1/upgrade-request')).toBe(false);
    expect(re.test('/api/edges/e1/update-settings/more')).toBe(false);
    expect(new RegExp(writePattern('/api/sites/{siteId}')).test('/api/sites/42')).toBe(true);
  });
});
