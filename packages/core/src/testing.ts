import { SHOT_FILE, shotSet } from './look';
import { REUSE_RULES } from './reuse';
import { z } from 'zod';
import { loadFlow, saveFlow } from './agents';
import { audit } from './audit';
import { runActive } from './look';
import type { WriteRun, Evidence, Flow, Need, Ticket } from './types';

// The Testing stage: the agent checks each requirement in the live app or with its test, views its own
// screenshots, fixes what looks wrong and shoots again. The developer sees only evidence that passes.

const TestSchema = z.object({
  requirements: z.array(
    z.object({
      id: z.string().describe('The requirement id, R1, R2, ...'),
      ok: z.boolean().describe('True only when the evidence shows the requirement working'),
      test: z.string().describe('The test command that passed for it, or empty'),
      shots: z
        .array(z.string())
        .describe('The names that you gave the screenshot command for it (like R2-list), or empty'),
      seen: z
        .string()
        .describe('What the screenshots show, compared with the requirement; empty without shots'),
      data: z
        .enum(['real', 'fake', 'none'])
        .describe(
          'real: the evidence used data of the real backend only. fake: any faked API answer (mock.js) took part, also for one state or one write. none: a test alone proves it and the app showed no data'
        ),
      expected: z
        .string()
        .describe('When not ok: what should be true, in one plain sentence. Empty when ok'),
      found: z
        .string()
        .describe(
          'When not ok: what you found instead, in one plain sentence that names the case (the edge, the state, the page). Empty when ok'
        ),
      note: z.string().describe('When not ok: what you tried, and what a fix could be')
    })
  ),
  writes: z
    .array(
      z.object({
        method: z.string(),
        path: z.string().describe('The approved path, as in the list of approved writes'),
        made: z.boolean().describe('True only when the request reached the real backend'),
        result: z
          .string()
          .describe(
            'When made: the status and one line of the answer. When not made: why, for example that no real record exists'
          )
      })
    )
    .describe('One entry for each approved write. Empty when none are approved'),
  fixes: z.array(z.string()).describe('The code changes you made while testing, one line each'),
  summary: z.string().describe('Two or three sentences for the developer')
});

export type TestResult = z.infer<typeof TestSchema>;

/** The JSON schema of the test answer. The SDK makes the agent answer in this shape. */
export const TEST_SCHEMA = z.toJSONSchema(TestSchema, { target: 'draft-7' }) as unknown as Record<
  string,
  unknown
> & {
  properties: { requirements: { items?: { required?: string[] } } };
};

export function parseTest(output: unknown): TestResult {
  const r = TestSchema.safeParse(output);
  if (!r.success) {
    throw new Error(
      `The agent's test result has an unexpected shape. ${z.prettifyError(r.error).slice(0, 300)}`
    );
  }
  return r.data;
}

/** Why Testing cannot start for this record, or null. */
export function canTest(f: Flow | null): string | null {
  if (!f || f.stage !== 'testing') {
    return 'Testing starts after Development moves the ticket to Testing.';
  }
  if (!f.worktree) {
    return 'The ticket has no worktree. Run Development first.';
  }
  if (!f.requirements?.length) {
    return 'The plan has no requirements to test.';
  }
  return null;
}

/** Where the agent tests: the app's address, the browser session and the commands it may run. */
export type TestEnv = {
  url: string;
  session: string;
  shots: string;
  commands: string[];
  /** The dev-server output of this run. */
  appLog?: string;
  /** True when the fake API of earlier test runs is loaded already. */
  mocked?: boolean;
};

export function testPrompt(t: Ticket, f: Flow, boardComments: string[], env: TestEnv) {
  const left = (f.steps ?? []).filter((s) => s.state !== 'done');
  return [
    `You test the ticket ${t.key}: ${t.summary}`,
    'The code is built in this worktree. Check every requirement and collect evidence for it.',
    '',
    '# Requirements',
    ...(f.requirements ?? []).map((r) => `- ${r.id}: ${r.text}. Check: ${r.check}`),
    '',
    '# Writes to the backend',
    ...(f.writes?.length
      ? [
          'The developer approved these writes by moving the ticket to Testing. Make only these, and only for their requirement.',
          ...f.writes.map((w) => `- ${w.method} ${w.path}: ${w.why}`)
        ]
      : ['No writes to the backend are approved. Fake every write in .playwright-cli/mock.js.']),
    'Report each approved write in `writes`: made = true only when the request reached the real backend, with the',
    'status in `result`. When you cannot make it for real (for example no real record exists to write to), set made',
    'to false and say why. Never count a faked answer as made.',
    'Any other write gets 403 "not approved" from the test browser. Do not work around it: set ok to false for the',
    'requirement, and name the method and path in `note`, so the developer can add it with a comment.',
    ...(f.assumptions?.length
      ? [
          '',
          '# Assumptions to check',
          'The plan relied on these. Check each with real data, or show that the code makes it impossible. When one',
          'does not hold, set ok to false for the requirements that it affects, and say why in `note`.',
          ...f.assumptions.map((a) => `- ${a}`)
        ]
      : []),
    ...(left.length
      ? [
          '',
          '# Steps that Development left for Testing',
          ...left.map(
            (s) => `- Step ${s.n} (${s.text}) was left for Testing${s.note ? `: ${s.note}` : '.'}`
          )
        ]
      : []),
    ...(boardComments.length
      ? ['', '# Comments from the developer', ...boardComments.map((c) => `- ${c}`)]
      : []),
    '',
    '# How to test',
    `- The app of this worktree runs at ${env.url}. A browser is open and logged in.`,
    `- Drive it with \`pnpm exec playwright-cli -s=${env.session} <command>\` (goto, snapshot, click, fill, resize, eval).`,
    `- Take the screenshots of a requirement with \`${env.shots} <name>\`, where <name>`,
    '  starts with the requirement id (R2-sorted). It takes light and dark at desktop, wide and phone size, and prints the paths.',
    '  In `shots`, give the names only. The board attaches every file of each set.',
    '  Add --focus="<heading text or CSS selector>" for the part of the page that the requirement is about.',
    '  The shots show the viewport, not the whole page: without --focus a phone shot shows only the top.',
    '  When you view the shots, check that each size shows that part. If not, take the set again with a better target.',
    '- A requirement that a test proves needs the test only: run it and give the command.',
    '- A 502 or a connection error from the app usually means the network or the dev backend blinked.',
    '  Wait a few seconds, reload and try again, up to 3 times, before you report the backend as broken.',
    ...(env.mocked
      ? [
          '- The fake API from earlier test runs is loaded already, from .playwright-cli/mock.js. Use it.',
          '  Do not rebuild it. When a state is missing, add it to that file, then load the file again with run-code.'
        ]
      : []),
    '- When the account has no data for a state, fake the API answers in this browser only: write a',
    `  route file with the Write tool to .playwright-cli/mock.js, then run \`pnpm exec playwright-cli -s=${env.session} run-code --filename .playwright-cli/mock.js\`.`,
    '  Do not put data in shell variables or heredocs: those commands are refused. Set `data` to fake for every requirement',
    '  that a faked answer took part in, and say in `seen` which data was faked. Use real data first, where the account has it.',
    '- run-code files run in a sandbox: no require, import, URL, setTimeout or globalThis. Keep state in',
    '  variables inside the function, and read URL paths with a regex. Every route handler must call',
    '  fulfill or continue, also after an error: a handler that throws leaves the page loading.',
    '- Use Storybook only for a new shared component or a large new component. Features use the live app.',
    '- When you fix code or tests:',
    ...REUSE_RULES,
    '- View every screenshot with Read. Write in `seen` what it shows. If it does not show the requirement working,',
    '  or it looks wrong (overlap, cut-off text, a blank or loading page), fix the code and take the shots again.',
    '  Try at most 3 times for each requirement. Then set ok to false and fill three fields:',
    '  `expected` (what should be true, one plain sentence), `found` (what you found instead, one plain sentence that',
    '  names the case: the edge, the state, the page) and `note` (what you tried, and what a fix could be).',
    '  Write `expected` and `found` for a developer who has not read the code: no function or file names.',
    `- Shell commands that you may run, one for each call: ${env.commands.join('; ')}. Anything else is refused.`,
    '- Check every data state that a check lists: with real data where it exists, else in .playwright-cli/mock.js.',
    '  Name the state in the shot name (R2-empty, R2-many).',
    '- For each new or changed control (link, button, tooltip, hover state, menu), use it with real input: click,',
    '  hover, press Tab, Enter and Escape. element.focus() does not show :focus-visible. Text that tells the user to',
    '  do something must be the control that does it. Write in `seen` what each one did.',
    '- At phone size, also eval document.documentElement.scrollWidth <= innerWidth, and check that dialog footers',
    '  and bottom content are visible and that tap targets are at least 24 px.',
    '- If you resize the browser yourself, read outerWidth and outerHeight first, and restore it to',
    '  outerWidth × (outerHeight − 87) when you are done.',
    '- Wrap the body of every page.on listener in try/catch: a throw closes the browser.',
    '- After any fix, take again every set whose page the fix can change, not only the set of the fixed requirement.',
    `- After your last code change, hard-reload each page that the change touches, then run \`pnpm exec playwright-cli -s=${env.session} console\`.`,
    `  Any error is a failure: fix it or set ok to false.${env.appLog ? ` Also search ${env.appLog} for SyntaxError and "Failed to reload".` : ''}`,
    '- Do not commit or push. Do not close the browser or stop the app: the board does that.',
    '- Keep scratch files in .playwright-cli/. Never print tokens or secrets.'
  ].join('\n');
}

/** The record after a test run: the evidence for each requirement, and what the developer does next. */
export function applyTest(
  f: Flow,
  r: TestResult,
  shotFiles: { files: string[]; sizes: string[] } | null = null
): Flow {
  const evidence: Record<string, Evidence> = {};
  for (const x of r.requirements) {
    evidence[x.id] = {
      ok: x.ok,
      data: x.data,
      ...(x.test ? { test: x.test } : {}),
      ...(x.shots.length
        ? { shots: shotFiles ? expandShots(x.shots, shotFiles.files, shotFiles.sizes) : x.shots }
        : {}),
      ...(x.seen ? { seen: x.seen } : {}),
      ...(!x.ok && x.expected ? { expected: x.expected } : {}),
      ...(!x.ok && x.found ? { found: x.found } : {}),
      ...(x.note && !x.ok ? { note: x.note } : {})
    };
  }
  const writeRuns = r.writes.map((w) => ({
    method: w.method,
    path: w.path,
    made: w.made,
    result: w.result
  }));
  return {
    ...f,
    evidence,
    writeRuns,
    review: r.summary,
    need: withDataNote(testNeed(f, evidence), evidence, f, writeRuns)
  };
}

/**
 * A pass that rests on fake data, or on an approved write that was not made, is not the same as a
 * pass on the real backend. The note stays in the decision text, so the developer can follow up.
 */
/** The approved writes that no test run made against the real backend. */
export function untestedWrites(f: Flow, runs: WriteRun[] = f.writeRuns ?? []) {
  return (f.writes ?? []).filter(
    (w) => !runs.some((r) => r.made && r.method === w.method && r.path === w.path)
  );
}

function withDataNote(
  need: Need,
  evidence: Record<string, Evidence>,
  f: Flow,
  runs: WriteRun[]
): Need {
  if (need.kind !== 'decision') {
    return need;
  }
  const fake = Object.entries(evidence)
    .filter(([, e]) => e.data === 'fake')
    .map(([id]) => id);
  const untested = untestedWrites(f, runs);
  const lines = [
    fake.length ? `Fake data: ${listIds(fake)}.` : '',
    untested.length
      ? `Approved writes not made against the backend: ${untested.map((w) => `${w.method} ${w.path}`).join(', ')}.`
      : ''
  ].filter(Boolean);
  if (!lines.length) {
    return need;
  }
  // Approving with a write that was never made is a choice: the button says so.
  const actions = untested.length
    ? need.actions.map((x) =>
        x.id === 'approveTesting' ? { ...x, label: 'Approve with untested writes' } : x
      )
    : need.actions;
  return { ...need, detail: lines.join(' '), actions };
}

/** What the developer does after a test run: test again, or approve. */
function testNeed(f: Flow, evidence: Record<string, Evidence>): Need {
  const ids = (f.requirements ?? []).map((q) => q.id);
  const failing = ids.filter((id) => !evidence[id]?.ok);
  const open = { id: 'openWorktree', label: 'Open worktree' };
  return failing.length
    ? {
        kind: 'problem',
        ask: `${listIds(failing)} ${failing.length > 1 ? 'do' : 'does'} not pass.`,
        detail: failing
          .map((id) => {
            const e = evidence[id];
            if (e?.found) {
              return `${id}: ${e.expected ? `Expected: ${e.expected.replace(/\.?$/, '.')} ` : ''}Found: ${e.found.replace(/\.?$/, '.')}`;
            }
            return `${id}: ${(e?.note || 'No evidence.').replace(/\.?$/, '.')}`;
          })
          .join(' '),
        // A requirement that was tested and failed needs a code fix: testing again cannot pass it.
        // A requirement with no evidence was not tested: that needs a test run.
        actions: failing.some((id) => evidence[id])
          ? [
              { id: 'startDevelopment', label: 'Fix and build again' },
              { id: 'startTesting', label: 'Test again' },
              open
            ]
          : [{ id: 'startTesting', label: 'Test again' }, open]
      }
    : {
        kind: 'decision',
        ask: `Tested: ${ids.length} of ${ids.length} requirements pass, with evidence.`,
        actions: [{ id: 'approveTesting', label: 'Approve for code review' }, open]
      };
}

/**
 * Screenshots that are older than the last code change may not show the final code. That is a
 * reason to look, not a failure: the requirement keeps its result, the ticket says which shots are
 * older and what changed, and you decide. A rerun is offered only through the usual buttons.
 * `shotTimes` has the time of each shot; `changed` is the newest changed file and its time.
 */
export function markStaleShots(
  f: Flow,
  shotTimes: Record<string, number>,
  changed: { file: string; at: number }
): Flow {
  const older = Object.entries(f.evidence ?? {})
    .filter(([, e]) => e.ok && (e.shots ?? []).some((p) => (shotTimes[p] ?? Infinity) < changed.at))
    .map(([id]) => id);
  if (!older.length || !f.need || f.need.kind !== 'decision') {
    return f;
  }
  return {
    ...f,
    need: {
      ...f.need,
      // Keep what the note already says, for example the fake data and the writes not made.
      detail: [
        f.need.detail,
        `The screenshots of ${listIds(older)} are older than the last change, in ${changed.file}. If that change can affect them, test again. Otherwise approve.`
      ]
        .filter(Boolean)
        .join(' '),
      actions: [
        ...f.need.actions.slice(0, 1),
        { id: 'startTesting', label: 'Test again' },
        ...f.need.actions.slice(1)
      ]
    }
  };
}

const listIds = (ids: string[]) =>
  ids.length === 1 ? ids[0]! : `${ids.slice(0, -1).join(', ')} and ${ids.at(-1)!}`;

/** The developer approves the tested change. Code review starts from here. */
export function approveTestingFlow(f: Flow, at: string): Flow {
  return {
    ...f,
    approved: at,
    need: {
      kind: 'decision',
      ask: 'Approved for code review.',
      actions: [
        { id: 'startCodeReview', label: 'Start code review' },
        { id: 'openWorktree', label: 'Open worktree' }
      ]
    }
  };
}

export async function approveTesting(key: string) {
  const f = await loadFlow(key);
  if (!f || f.stage !== 'testing' || runActive(f) || f.need?.kind === 'problem') {
    throw new Error(`${key}: only a tested change with passing evidence can be approved.`);
  }
  const next = approveTestingFlow(f, new Date().toISOString());
  await saveFlow(key, next, 'developer');
  const untested = untestedWrites(f).map((w) => `${w.method} ${w.path}`);
  const fake = Object.entries(f.evidence ?? {})
    .filter(([, e]) => e.data === 'fake')
    .map(([id]) => id);
  await audit(key, 'developer', 'testing.approved', {
    ...(untested.length ? { untestedWrites: untested } : {}),
    ...(fake.length ? { fakeData: fake } : {})
  });
  return next;
}

/**
 * Every file of each named set, so the evidence never shows part of a set: the sizes in the config
 * order, light before dark at each size. A name with no files stays as the agent gave it.
 */
export function expandShots(names: string[], files: string[], sizes: string[]) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const n of names) {
    const set = shotSet(n);
    if (seen.has(set)) {
      continue;
    }
    seen.add(set);
    const mine = files.filter((p) => shotSet(p) === set && SHOT_FILE.test(p));
    if (!mine.length) {
      out.push(n);
      continue;
    }
    const rank = (p: string) => {
      const [, scheme, size] = SHOT_FILE.exec(p)!;
      const i = sizes.indexOf(size!);
      return (i < 0 ? sizes.length : i) * 2 + (scheme === 'dark' ? 1 : 0);
    };
    out.push(...mine.sort((a, b) => rank(a) - rank(b)));
  }
  return out;
}
