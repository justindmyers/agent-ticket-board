import { describe, expect, it } from 'vitest';
import {
  FINAL_PLAN_SCHEMA,
  isFinalPlan,
  answerEarlier,
  answerQuestion,
  applyPlan,
  parsePlan,
  PLAN_SCHEMA,
  planPrompt,
  type PlanResult
} from './planning';
import type { Ticket } from './types';

const ticket: Ticket = {
  key: 'PROJ-7',
  summary: 'Sort cameras by zone count',
  status: 'To Do',
  type: 'Story',
  priority: 'Medium',
  labels: ['ui'],
  points: 3,
  updated: null,
  description: {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Users want the busiest cameras first.' }]
      },
      { type: 'heading', content: [{ type: 'text', text: 'Acceptance criteria' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'A sort option "Zones" exists.' }] }
    ]
  },
  comments: [
    {
      author: 'Reviewer',
      created: '2026-01-02',
      body: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Descending by default.' }] }
        ]
      }
    }
  ]
};

const result: PlanResult = {
  assumptions: [],
  requirements: [
    { id: 'R1', text: 'A "Zones" sort option exists', check: 'Unit test for the sort' },
    { id: 'R2', text: 'Descending by default', check: 'Click path: open the list, see the order' }
  ],
  questions: [],
  steps: [
    { text: 'Add the sort key', covers: ['R1', 'R2'] },
    { text: 'Add the option to the menu', covers: ['R1'] }
  ]
};

describe('planPrompt', () => {
  it('has the key, the summary, the description sections, the tracker comments and the board comments', () => {
    const p = planPrompt(ticket, ['Keep the old sort as the fallback.']);
    expect(p).toContain('PROJ-7: Sort cameras by zone count');
    expect(p).toContain('Users want the busiest cameras first.');
    expect(p).toContain('## Acceptance criteria');
    expect(p).toContain('Descending by default.');
    expect(p).toContain('Keep the old sort as the fallback.');
  });

  it('says that the session is read-only and must not change files', () => {
    expect(planPrompt(ticket, [])).toMatch(/read-only/i);
  });
});

describe('PLAN_SCHEMA', () => {
  it('requires the three lists', () => {
    expect(PLAN_SCHEMA.required).toEqual(['requirements', 'questions', 'assumptions', 'steps']);
  });

  it('is draft-07, the version that Claude Code validates', () => {
    expect(PLAN_SCHEMA.$schema).toBe('http://json-schema.org/draft-07/schema#');
  });

  it('asks for each question as an object with the reason, the options and the pick', () => {
    expect(PLAN_SCHEMA.properties.questions?.items?.required).toEqual([
      'q',
      'why',
      'options',
      'recommended'
    ]);
  });
});

describe('parsePlan', () => {
  it('accepts a plan in the schema shape', () => {
    expect(parsePlan(result)).toEqual(result);
  });

  it('refuses questions as plain text with a message, not a crash', () => {
    expect(() => parsePlan({ ...result, questions: ['Which list?'] })).toThrow(
      /unexpected shape.*questions/s
    );
  });
});

describe('applyPlan', () => {
  it('writes the plan into the record and asks the developer to approve it', () => {
    const f = applyPlan({ stage: 'planning' }, result);
    expect(f.requirements).toEqual(result.requirements);
    expect(f.steps).toEqual([
      { n: 1, text: 'Add the sort key', covers: ['R1', 'R2'], state: 'todo' },
      { n: 2, text: 'Add the option to the menu', covers: ['R1'], state: 'todo' }
    ]);
    expect(f.need).toEqual({
      kind: 'decision',
      ask: 'Approve the plan: 2 requirements, 2 steps',
      actions: [
        { id: 'approve', label: 'Approve plan and start' },
        { id: 'replan', label: 'Re-plan' }
      ]
    });
  });

  it('asks for answers first when the plan has questions, with the options and the pick', () => {
    const f = applyPlan(
      { stage: 'planning' },
      {
        ...result,
        questions: [
          {
            q: 'Which list?',
            why: 'Two lists show cameras.',
            options: ['Map list', 'Table'],
            recommended: 0
          },
          { q: 'Mobile too?', why: 'The mobile list is separate.', options: [], recommended: null }
        ]
      }
    );
    expect(f.questions).toEqual([
      {
        q: 'Which list?',
        why: 'Two lists show cameras.',
        options: ['Map list', 'Table'],
        recommended: 0
      },
      { q: 'Mobile too?', why: 'The mobile list is separate.', options: [] }
    ]);
    expect(f.need).toEqual({
      kind: 'decision',
      ask: 'Answer 2 questions, then re-plan',
      actions: [{ id: 'replan', label: 'Re-plan without answers' }]
    });
  });

  it('moves the answered questions to the earlier answers, and drops the open ones', () => {
    const f = applyPlan(
      {
        stage: 'planning',
        answered: [{ q: 'First?', a: 'A' }],
        questions: [{ q: 'Old?', a: 'Yes', why: 'w', options: ['Yes'] }, { q: 'Skipped?' }]
      },
      result
    );
    expect(f.questions).toEqual([]);
    expect(f.answered).toEqual([
      { q: 'First?', a: 'A' },
      { q: 'Old?', a: 'Yes' }
    ]);
  });

  it('keeps one earlier answer for each question, the latest', () => {
    const f = applyPlan(
      {
        stage: 'planning',
        answered: [{ q: 'Same?', a: 'Old' }],
        questions: [{ q: 'Same?', a: 'New' }]
      },
      result
    );
    expect(f.answered).toEqual([{ q: 'Same?', a: 'New' }]);
  });

  it('refuses a step that covers a requirement that does not exist', () => {
    expect(() =>
      applyPlan({ stage: 'planning' }, { ...result, steps: [{ text: 'x', covers: ['R9'] }] })
    ).toThrow(/R9/);
  });
});

describe('answerQuestion', () => {
  const f = applyPlan(
    { stage: 'planning' },
    {
      ...result,
      questions: [
        { q: 'A?', why: '', options: ['x', 'y'], recommended: 1 },
        { q: 'B?', why: '', options: [], recommended: null }
      ]
    }
  );

  it('records the answer and counts down in the need', () => {
    const g = answerQuestion(f, 0, 'y');
    expect(g.questions?.[0]?.a).toBe('y');
    expect(g.need?.ask).toBe('Answer 1 more question, then re-plan');
  });

  it('asks to re-plan with the answers when all are answered, and an empty answer clears one', () => {
    const g = answerQuestion(answerQuestion(f, 0, 'y'), 1, '  Only on desktop. ');
    expect(g.questions?.[1]?.a).toBe('Only on desktop.');
    expect(g.need).toEqual({
      kind: 'decision',
      ask: 'All questions answered: re-plan with your answers',
      actions: [{ id: 'replan', label: 'Re-plan with answers' }]
    });
    expect(answerQuestion(g, 1, ' ').questions?.[1]?.a).toBeUndefined();
  });

  it('refuses a question number that does not exist', () => {
    expect(() => answerQuestion(f, 5, 'x')).toThrow(/no question 6/);
  });
});

describe('planPrompt with answers', () => {
  it('gives the earlier questions and the answers to the next run', () => {
    const p = planPrompt(ticket, [], [{ q: 'Which list?', a: 'Map list' }, { q: 'Mobile?' }]);
    expect(p).toContain('# Answers from the developer');
    expect(p).toContain('- Which list? Answer: Map list');
    expect(p).not.toContain('Mobile?');
  });
});

describe('answerEarlier', () => {
  const f = applyPlan({ stage: 'planning', answered: [{ q: 'Which list?', a: 'Map' }] }, result);

  it('changes an earlier answer and asks for a re-plan', () => {
    const g = answerEarlier(f, 0, 'Table');
    expect(g.answered).toEqual([{ q: 'Which list?', a: 'Table' }]);
    expect(g.need).toEqual({
      kind: 'decision',
      ask: 'An earlier answer changed: re-plan with it',
      actions: [{ id: 'replan', label: 'Re-plan with answers' }]
    });
  });

  it('refuses an empty answer and a number that does not exist', () => {
    expect(() => answerEarlier(f, 0, ' ')).toThrow(/empty/);
    expect(() => answerEarlier(f, 3, 'x')).toThrow(/no earlier answer 4/);
  });
});

describe('planPrompt with earlier answers', () => {
  it('gives the earlier answers and the new ones', () => {
    const p = planPrompt(ticket, [], [{ q: 'Mobile?', a: 'No' }], [{ q: 'Which list?', a: 'Map' }]);
    expect(p).toContain('- Which list? Answer: Map');
    expect(p).toContain('- Mobile? Answer: No');
  });
});

describe('the question budget', () => {
  it('limits the first plan to 3 questions, and asks for assumptions', () => {
    expect(PLAN_SCHEMA.properties.questions).toMatchObject({ maxItems: 3 });
    expect(PLAN_SCHEMA.required).toContain('assumptions');
    expect(planPrompt(ticket, [])).toMatch(/at most 3 questions/);
  });

  it('gives a re-plan with answers no way to ask: questions are not in its schema', () => {
    expect(FINAL_PLAN_SCHEMA.properties.questions).toBeUndefined();
    expect(FINAL_PLAN_SCHEMA.required).not.toContain('questions');
    const p = planPrompt(ticket, [], [], [{ q: 'Which list?', a: 'Map' }]);
    expect(p).toMatch(/Do not ask questions/);
    expect(p).not.toMatch(/at most 3 questions/);
  });

  it('is final once the developer has answered anything', () => {
    expect(isFinalPlan({ stage: 'planning' })).toBe(false);
    expect(isFinalPlan({ stage: 'planning', questions: [{ q: 'A?', a: 'Yes' }] })).toBe(true);
    expect(isFinalPlan({ stage: 'planning', answered: [{ q: 'A?', a: 'Yes' }] })).toBe(true);
  });

  it('reads a final plan with no questions field, and keeps the assumptions', () => {
    const { questions: _q, ...rest } = { ...result, assumptions: ['Desktop only'] };
    void _q;
    const plan = parsePlan(rest, true);
    expect(plan.questions).toEqual([]);
    const f = applyPlan({ stage: 'planning', answered: [{ q: 'A?', a: 'Yes' }] }, plan);
    expect(f.assumptions).toEqual(['Desktop only']);
    expect(f.need?.actions[0]?.id).toBe('approve');
  });
});

describe('lookups in planning', () => {
  it('tells the agent which read-only commands it may run, and not to leave placeholders', () => {
    const p = planPrompt(ticket, [], [], [], ['gh pr view', 'acli jira workitem view']);
    expect(p).toContain(
      'Shell commands that you may run, one for each call: gh pr view; acli jira workitem view.'
    );
    expect(p).toMatch(/Do not leave placeholders/);
    expect(planPrompt(ticket, [])).not.toMatch(/Shell commands/);
  });
});

describe('steps and Testing', () => {
  it('keeps browser and manual checks out of the build steps', () => {
    expect(planPrompt(ticket, [])).toMatch(
      /Do not make browser, device or manual checks\s+into steps/
    );
  });
});
