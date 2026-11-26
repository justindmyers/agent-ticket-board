// The stage list, the colors and the accent rule that every client shares. This file has no imports,
// because the Claude Code plugin gets a verbatim copy of it (hooks/look.gen.ts) and cannot import core.

export type Stage = 'planning' | 'development' | 'testing' | 'code-review';

export type AgentKind = 'problem' | 'decision' | 'running' | 'waiting' | 'finished';

export type TrackerState = 'todo' | 'active' | 'blocked' | 'done';

/** `hex` is the accent; `text` is the light-theme text shade (4.5:1 on white). */
export const PALETTE = {
  blue: { hex: '#3A86FE', text: '#1d5fd1' },
  aqua: { hex: '#64E4ED', text: '#0b6f78' },
  amber: { hex: '#FFBE0C', text: '#7d5700' },
  green: { hex: '#1EC46E', text: '#13804a' },
  violet: { hex: '#A78BFA', text: '#6d28d9' },
  red: { hex: '#FA4045', text: '#c8262b' },
  neutral: { hex: '#96969D', text: '#55555c' }
} as const;

export type Accent = keyof typeof PALETTE;

export const STAGES: { id: Stage; label: string; accent: Accent }[] = [
  { id: 'planning', label: 'Planning', accent: 'blue' },
  { id: 'development', label: 'Development', accent: 'aqua' },
  { id: 'testing', label: 'Testing', accent: 'amber' },
  { id: 'code-review', label: 'Code review', accent: 'green' }
];

/** The color of a ticket with no agent record: grey not started, blue active, red blocked, green finished. */
export const STATE_ACCENT: Record<TrackerState, Accent> = {
  todo: 'neutral',
  active: 'blue',
  blocked: 'red',
  done: 'green'
};

/** An agent colors a ticket by its kind, then by its stage. With no agent, the tracker state decides. */
export function accentOf(
  agent: { kind: AgentKind; stage: string } | null | undefined,
  state?: TrackerState
): Accent {
  if (agent?.kind === 'problem') {
    return 'red';
  }
  if (agent?.kind === 'finished') {
    return 'green';
  }
  if (agent) {
    return STAGES.find((s) => s.id === agent.stage)?.accent ?? 'neutral';
  }
  return STATE_ACCENT[state ?? 'todo'];
}

/** A run that still holds the ticket: the developer can stop it, not start another. */
export const runActive = (f: { run?: { state: string } } | null | undefined) =>
  f?.run?.state === 'queued' || f?.run?.state === 'running';

/** Planning can start with no record, or after a run that stopped before it wrote a plan. */
export const planStartable = (
  f: { run?: { state: string }; requirements?: unknown[]; need?: unknown } | null | undefined
) => !f || (!runActive(f) && !f.requirements?.length && !f.need && f.run?.state === 'stopped');

/** One line about the last agent run, for the ticket page. Null while a run is active. */
export function runLine(
  run: { state: string; model: string; cost?: number } | undefined
): string | null {
  if (!run || run.state === 'queued' || run.state === 'running') {
    return null;
  }
  const how =
    { done: 'finished', failed: 'failed', stopped: 'was stopped' }[run.state] ?? run.state;
  const cost = run.cost === undefined ? '' : `, $${run.cost.toFixed(2)}`;
  return `The last agent run ${how} (${run.model}${cost}).`;
}

type RunLike = {
  state: string;
  stage?: string;
  task?: 'gate' | 'verify' | 'commit-plan' | 'commit';
  model: string;
  waiting?: string;
  app?: string;
};

/** The title, the caption and the colour of a queued or running agent run. */
export function runText(run: RunLike): {
  title: string;
  caption: string;
  accent: 'blue' | 'aqua' | 'amber' | 'green';
} {
  const accent =
    run.stage === 'development'
      ? 'aqua'
      : run.stage === 'testing'
        ? 'amber'
        : run.stage === 'code-review'
          ? 'green'
          : 'blue';
  if (run.state === 'queued') {
    return {
      title: 'Queued',
      caption: 'Every agent slot is busy. The run starts when one is free.',
      accent
    };
  }
  if (run.stage === 'testing') {
    return run.waiting === 'login'
      ? {
          title: 'Log in to test',
          caption:
            'A browser window opened for this ticket. Log in there. The test continues by itself.',
          accent
        }
      : {
          title: 'Testing now',
          caption: `The agent checks each requirement in the live app${run.app ? ` at ${run.app}` : ''} with ${run.model}, and fixes what looks wrong.`,
          accent
        };
  }
  if (run.task === 'commit-plan') {
    return {
      title: 'Planning the commits',
      caption: `The agent groups the change into commits with ${run.model}. It changes no files.`,
      accent
    };
  }
  if (run.task === 'commit') {
    return {
      title: 'Making the commits',
      caption:
        'The board commits each group in order. The hooks of the repository run. No agent runs.',
      accent
    };
  }
  if (run.task === 'verify') {
    return {
      title: 'Running the checks',
      caption: 'The board runs the checks of the repository on the change as it is. No agent runs.',
      accent
    };
  }
  if (run.task === 'gate') {
    return {
      title: 'Running the checks',
      caption:
        'The board runs the checks of the repository, merges the base branch and runs them again. No agent runs.',
      accent
    };
  }
  if (run.stage === 'code-review') {
    return {
      title: 'Reviewing now',
      caption: `Reviewers read the change and the agent fixes what they confirm, with ${run.model}. It does not commit or push.`,
      accent
    };
  }
  if (run.stage === 'development') {
    return {
      title: 'Building now',
      caption: `The agent changes code in the ticket's worktree with ${run.model}. It does not commit or push.`,
      accent
    };
  }
  return {
    title: 'Planning now',
    caption: `The agent reads the ticket and the code with ${run.model}. It changes no files.`,
    accent
  };
}

/** A screenshot's short name: its colour scheme and size ("dark 390×844"), or the file name. */
export function shotLabel(path: string) {
  const file = path.split('/').pop() ?? path;
  const m = /(light|dark)-(\d+)x(\d+)\.png$/.exec(file);
  return m ? `${m[1]} ${m[2]}×${m[3]}` : file;
}

/** The cost of a ticket's agent runs so far, or null before the first run. */
export function spentText(spent: number | undefined) {
  return spent === undefined ? null : `$${spent.toFixed(2)} so far`;
}

/** What the agent does now, in a few words, from one tool call. Null for calls that show elsewhere. */
export function activityText(tool: string, input: Record<string, unknown>): string | null {
  const file = String(input.file_path ?? '');
  const name = file.split('/').pop() ?? '';
  if (tool === 'Bash') {
    const cmd = String(input.command ?? '').trim();
    const pw = /playwright-cli(?:\s+-s=\S+)?\s+(\S+)\s*(\S*)/.exec(cmd);
    if (pw) {
      if (pw[1] === 'goto' || pw[1] === 'open') {
        return `Opening ${pw[2] ? pw[2].replace(/^https?:\/\/[^/]+/, '') || '/' : 'the app'}`;
      }
      if (pw[1] === 'snapshot' || pw[1] === 'find') {
        return 'Reading the page';
      }
      if (pw[1] === 'screenshot') {
        return 'Taking a screenshot';
      }
      return 'Using the page';
    }
    const shots = /\sshots?\s+\S+\s+(\S+)/.exec(cmd);
    if (shots) {
      return `Taking screenshots: ${shots[1]}`;
    }
    const first = cmd.split('\n')[0] ?? '';
    return `Running ${first.length > 70 ? first.slice(0, 69) + '…' : first}`;
  }
  if (tool === 'Read') {
    return /\.png$/i.test(file) ? `Viewing a screenshot: ${shotLabel(file)}` : `Reading ${name}`;
  }
  if (tool === 'Edit' || tool === 'Write' || tool === 'MultiEdit') {
    return `Editing ${name}`;
  }
  if (tool === 'Grep' || tool === 'Glob') {
    return 'Searching the code';
  }
  return null;
}

export const SHOT_FILE = /-(light|dark)-(\d+x\d+)\.png$/;

/** The set name of a screenshot: the name given to the screenshot command (R2-list). */
export const shotSet = (nameOrPath: string) =>
  (nameOrPath.split('/').pop() ?? '').replace(SHOT_FILE, '');

/** The shots of one requirement, grouped by set in their order. */
export function shotGroups(shots: string[]) {
  const groups: { set: string; shots: string[] }[] = [];
  for (const p of shots) {
    const set = shotSet(p);
    const g = groups.find((x) => x.set === set);
    if (g) {
      g.shots.push(p);
    } else {
      groups.push({ set, shots: [p] });
    }
  }
  return groups;
}

/** What the Writes section of a ticket says, in Planning and in Testing. */
export function writesText(stage: string, count: number) {
  if (stage === 'planning') {
    return count
      ? 'Testing may make only these writes to the backend. Moving the ticket to Testing approves them. To change the list, comment and re-plan first.'
      : 'None: the tests fake every write. The test browser refuses real writes to the backend.';
  }
  return count
    ? 'Moving the ticket to Testing approved these. The test browser refuses every other write to the backend.'
    : 'No writes approved: the test browser refuses every write to the backend.';
}

/** A command that loads the computer: a type check, lint, tests or a build. They run one at a time. */
export function isHeavy(cmd: string) {
  return /(check:types|typecheck|\btsc\b|test:once|\bvitest\b|\bjest\b|\beslint\b|\blint\b|\bbuild\b)/.test(
    cmd.replace(/\bcat\s+\S+/g, '')
  );
}
