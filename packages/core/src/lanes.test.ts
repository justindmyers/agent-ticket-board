import { afterEach, describe, expect, it } from 'vitest';
import { FLOWS, flowFor } from './agents';
import { agentFor } from './lanes';
import type { Flow } from './types';

const run = (state: NonNullable<Flow['run']>['state']): Flow['run'] => ({
  state,
  stage: 'planning',
  started: '2026-01-01T00:00:00Z',
  model: 'sonnet'
});

afterEach(() => {
  for (const k of Object.keys(FLOWS)) {
    delete FLOWS[k];
  }
});

describe('agentFor with an agent run', () => {
  it('shows a running run as running, before any need', () => {
    FLOWS['PROJ-1'] = { stage: 'planning', run: run('running') };
    expect(agentFor('PROJ-1')).toMatchObject({ stage: 'planning', kind: 'running' });
  });

  it('shows the current step of a running build, like "2/3"', () => {
    FLOWS['PROJ-1'] = {
      stage: 'development',
      run: { ...run('running')!, stage: 'development' },
      steps: [
        { n: 1, text: 'a', covers: [], state: 'done' },
        { n: 2, text: 'b', covers: [], state: 'current' },
        { n: 3, text: 'c', covers: [], state: 'todo' }
      ]
    };
    expect(agentFor('PROJ-1')).toMatchObject({ kind: 'running', progress: '2/3' });
  });

  it('shows a queued run as waiting, with the word queued', () => {
    FLOWS['PROJ-1'] = { stage: 'planning', run: run('queued') };
    expect(agentFor('PROJ-1')).toMatchObject({ kind: 'waiting', progress: 'queued' });
  });

  it('shows the need of a finished run, for example the plan to approve', () => {
    FLOWS['PROJ-1'] = {
      stage: 'planning',
      run: run('done'),
      need: {
        kind: 'decision',
        ask: 'Approve the plan',
        actions: [{ id: 'approvePlan', label: 'Approve plan and start' }]
      }
    };
    expect(agentFor('PROJ-1')).toMatchObject({ kind: 'decision', ask: 'Approve the plan' });
  });
});

describe('a record with no active run and no need', () => {
  it('gets the next step of its plan, so there is always something to click', () => {
    FLOWS['PROJ-9'] = {
      stage: 'planning',
      run: { ...run('stopped')!, stage: 'planning' },
      requirements: [{ id: 'R1', text: 'x', check: 'y' }],
      questions: [{ q: 'A?', a: 'Yes' }],
      steps: [{ n: 1, text: 'a', covers: ['R1'], state: 'todo' }]
    };
    expect(flowFor('PROJ-9')?.need).toEqual({
      kind: 'decision',
      ask: 'All questions answered: re-plan with your answers',
      actions: [{ id: 'replan', label: 'Re-plan with answers' }]
    });
    expect(agentFor('PROJ-9')).toMatchObject({ kind: 'decision' });
  });

  it('offers Start again for a stopped build', () => {
    FLOWS['PROJ-10'] = {
      stage: 'development',
      run: { ...run('stopped')!, stage: 'development' },
      steps: [{ n: 1, text: 'a', covers: [], state: 'done' }]
    };
    expect(flowFor('PROJ-10')?.need).toEqual({
      kind: 'decision',
      ask: 'Building was stopped. 1 of 1 steps are done.',
      actions: [{ id: 'startDevelopment', label: 'Start again' }]
    });
  });

  it('leaves a running record and a record with a need alone', () => {
    FLOWS['PROJ-11'] = {
      stage: 'planning',
      run: run('running'),
      requirements: [{ id: 'R1', text: 'x', check: 'y' }]
    };
    expect(flowFor('PROJ-11')?.need).toBeUndefined();
  });
});
