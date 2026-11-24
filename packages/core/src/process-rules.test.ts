import { describe, expect, it } from 'vitest';
import { buildPrompt } from './development';
import { planPrompt } from './planning';
import { testPrompt } from './testing';

// The developer's tested process for agent work, as rules in each stage's prompt.

const story = {
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
const bug = { ...story, type: 'Bug' };
const f = {
  stage: 'development' as const,
  requirements: [{ id: 'R1', text: 'x', check: 'y' }],
  steps: [{ n: 1, text: 'a', covers: ['R1'] }],
  assumptions: ['The list is never empty']
};
const env = {
  url: 'http://localhost:3002/',
  session: 'atb-PROJ-9',
  shots: 'atb shots PROJ-9',
  commands: [],
  appLog: '/runs/r1/app.log'
};

describe('planning rules', () => {
  const p = planPrompt(story as never, []);
  it('lists the data states that each data requirement must be seen in', () => {
    expect(p).toMatch(/zero, one, many, missing fields,\s+unknown references/);
  });
  it('stays in the scope of the ticket', () => {
    expect(p).toMatch(
      /Requirements cover only what the ticket, its comments and the developer's notes ask/
    );
  });
  it('takes the UI of earlier pull requests for the ticket as the spec', () => {
    expect(p).toContain('gh pr list --search PROJ-9 --state all');
    expect(p).toMatch(/its layout and interactions are the spec/);
  });
  it('makes a bug plan reproduce the reported symptom, and only a bug plan', () => {
    expect(planPrompt(bug as never, [])).toMatch(/R1 states the reported symptom/);
    expect(p).not.toMatch(/R1 states the reported symptom/);
  });
});

describe('build rules', () => {
  const p = buildPrompt(story as never, f as never, []);
  it('runs only the changed test files, one heavy command at a time', () => {
    expect(p).toMatch(/only the test files in git diff --name-only and the untracked files/);
    expect(p).toMatch(/Never a folder or the whole suite/);
    expect(p).toMatch(/one after the other, never at the same time/);
  });
  it('starts no servers', () => {
    expect(p).toMatch(/Do not start a dev server, Storybook or a watcher/);
  });
  it('runs the generators that the repository checks', () => {
    expect(p).toMatch(/run the generators that\s+your change needs before the final gate/);
  });
});

describe('test rules', () => {
  const p = testPrompt(story as never, f as never, [], env);
  it('reloads after the last change and reads the console and the app log', () => {
    expect(p).toMatch(/hard-reload each page that the change touches/);
    expect(p).toContain('pnpm exec playwright-cli -s=atb-PROJ-9 console');
    expect(p).toContain('/runs/r1/app.log');
  });
  it('takes again every set that a fix can change', () => {
    expect(p).toMatch(/After any fix, take again every set whose page the fix can change/);
  });
  it('uses every new control with real input', () => {
    expect(p).toMatch(/click,\s+hover, press Tab, Enter and Escape/);
  });
  it('checks each data state of a check, and names it in the shot', () => {
    expect(p).toMatch(/Check every data state that a check lists/);
  });
  it('checks the phone size for sideways scroll, footers and tap targets', () => {
    expect(p).toMatch(/scrollWidth <= innerWidth/);
    expect(p).toMatch(/at least 24 px/);
  });
  it('restores the window size after a resize, and guards listeners', () => {
    expect(p).toMatch(/restore it to\s+outerWidth × \(outerHeight − 87\)/);
    expect(p).toMatch(/Wrap the body of every page\.on listener in try\/catch/);
  });
  it('checks the assumptions of the plan', () => {
    expect(p).toContain('# Assumptions to check');
    expect(p).toContain('- The list is never empty');
  });
});
