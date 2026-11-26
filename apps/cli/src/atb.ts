// atb: the shared command line for every client; the Claude Code pane reaches core only through it.
// Run it with no command for the usage. JSON goes to stdout.
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import {
  acquireHeavy,
  HOME,
  releaseHeavy,
  addComment,
  agentFor,
  CONFIG,
  detect,
  isSection,
  detail,
  findPr,
  flowFor,
  groupOf,
  listComments,
  loadState,
  mdSections,
  moveTicket,
  jiraPanel,
  PRS,
  setAfterMerge,
  readCache,
  rememberTicket,
  saveSettings,
  settingsView,
  refreshPrs,
  refreshSprint,
  setAgentMayMove,
  setConfigValue,
  shapeSprint,
  STATUS,
  ticketUrl,
  trackerInfo,
  LOCAL,
  refreshLocalWork,
  adoptOffer,
  adoptWork,
  ignoreWork,
  isStage,
  callService,
  ensureService,
  saveAnswer,
  saveEarlierAnswer,
  serviceInfo,
  bundle,
  readTimeline,
  timelineText,
  loadFlow,
  moveToTesting
} from '@agent-ticket-board/core';
import { parseSizes, serve, TestBrowser } from '@agent-ticket-board/service';

const USAGE = `usage:
  atb sprint [--cached]                  sprint snapshot (cached: from ~/.agent-ticket-board/cache)
  atb ticket <KEY> [--cached]            ticket detail, agent record, comments and group
  atb comment <KEY> <text> [--run]       a comment for the agent (never sent to Jira)
  atb heavy acquire|release <OWNER>      the lock that runs heavy commands one at a time (used by the guard hook)
  atb change <KEY> <TEXT>                comment and re-plan: built work goes back to Planning for the change
  atb handoff <KEY>                      write the handoff file for a Claude Code chat; prints it and the prompt
  atb handback <KEY> <TEXT> [--replan]   the chat hands the ticket back: what changed, and the next step
  atb move <KEY> <STATUS> [--approved]   a Jira move by the agent, or one that the developer approved
  atb agent-may-move <KEY> on|off        the developer's permission for one ticket
  atb after-merge <KEY> <STATUS>|default the status for this ticket after its merge
  atb adopt <KEY> [--stage=<stage>]      take over the local work for a ticket (agent record only)
  atb ignore <KEY>                       hide the local branch for a ticket
  atb detect [--repo=<path>] [--only=tracker|repo]   proposed config values; writes nothing
  atb config [set <key> <json>]          the config, or one value that the developer accepted
  atb settings [--detect] [--only=…] | atb settings save <json>   the settings view
  atb answer <KEY> <N> <text> [--earlier]   answer plan question N, or change earlier answer N
  atb audit <KEY> [--json] [--tail=N]    the ticket's audit timeline
  atb audit <KEY> --bundle               one archive of the ticket's audit log, tokens removed
  atb to-testing <KEY>                   move a finished build with a clean gate to Testing
  atb test <KEY>                         test the build in the live app and collect evidence
  atb shots <KEY> <NAME> [--focus=<T>]   screenshots of the test browser's page, light and dark, each size;
                                         --focus scrolls a heading text or CSS selector to the top first
  atb open-shot <KEY> <PATH>             open a screenshot from the ticket's evidence
  atb approve-testing <KEY>              approve a tested change: the code review starts
  atb review <KEY>                       run the code review again
  atb commit-plan <KEY>                  an agent plans the commits of the change
  atb commit <KEY>                       make the planned commits
  atb gate <KEY>                         run the checks before a push, merge the base branch
  atb develop <KEY>                      start building the approved plan in the ticket's worktree
  atb plan <KEY>                         start a planning run (starts the service if it does not run)
  atb stop <KEY>                         stop the agent run of a ticket
  atb serve                              run the board service (clients start it for you)
  atb service [status|stop]              the state of the service, or stop it and all its processes
`;

const [cmd, ...rest] = process.argv.slice(2);
const flags = new Set(rest.filter((a) => a.startsWith('--')));
const option = (name: string) =>
  rest.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const args = rest.filter((a) => !a.startsWith('--'));
const out = (v: unknown) => process.stdout.write(`${JSON.stringify(v)}\n`);

async function ticket(key: string) {
  const cached = (await readCache()).tickets.find((t) => t.key === key);
  const useCache = flags.has('--cached') && cached?.description !== undefined;
  const t = useCache ? cached : await detail(key).catch(() => cached);
  if (!t) {
    throw new Error(`Unknown ticket ${key}`);
  }
  STATUS[key] = t.status;
  if (t !== cached) {
    await rememberTicket(t);
  }
  await refreshLocalWork([key]);
  if (!flags.has('--cached')) {
    await refreshPrs(findPr, [key]);
  }
  const sections = t.description ? mdSections(t.description) : t.description === null ? [] : null;
  return {
    ticket: t,
    group: groupOf(t, agentFor(key)),
    agent: agentFor(key),
    flow: flowFor(key),
    tracker: trackerInfo(t.status, LOCAL[key]),
    adopt: adoptOffer(key),
    comments: await listComments(key),
    jira: await jiraPanel(key, PRS[key]),
    sections,
    jiraUrl: ticketUrl(key)
  };
}

function runDetect() {
  const only = option('only');
  if (only !== undefined && !isSection(only)) {
    throw new Error('--only must be tracker or repo');
  }
  return detect({ only, repoPath: option('repo') ?? CONFIG.repo.path });
}

async function main() {
  await loadState();
  const key = args[0]?.toUpperCase();
  if (cmd === 'serve') {
    await serve();
    return;
  }
  if (cmd === 'service') {
    const info = await serviceInfo();
    if (args[0] === 'stop') {
      return out(info ? await callService(info, '/shutdown', {}) : { stopping: false });
    }
    return out(info ? await callService(info, '/health') : { ok: false });
  }
  if (cmd === 'audit' && key) {
    if (flags.has('--bundle')) {
      return out({ file: await bundle(key) });
    }
    const tail = Number(option('tail') ?? 0);
    const events = await readTimeline(key);
    const shown = tail > 0 ? events.slice(-tail) : events;
    if (flags.has('--json')) {
      return out({ events: shown, total: events.length, text: timelineText(shown) });
    }
    process.stdout.write(
      shown.length ? `${timelineText(shown)}\n` : `${key}: the audit log is empty.\n`
    );
    return;
  }
  if (cmd === 'to-testing' && key) {
    return out(await moveToTesting(key));
  }
  if (cmd === 'answer' && key && /^\d+$/.test(args[1] ?? '')) {
    const save = flags.has('--earlier') ? saveEarlierAnswer : saveAnswer;
    return out(await save(key, Number(args[1]), args.slice(2).join(' ')));
  }
  if (cmd === 'open-shot' && key && args[1]) {
    // Only a screenshot that the ticket's evidence lists, never any path.
    const f = await loadFlow(key);
    const listed = Object.values(f?.evidence ?? {}).some((x) => x.shots?.includes(args[1]!));
    if (!listed) {
      throw new Error(`${key}: that screenshot is not in the ticket's evidence.`);
    }
    execFileSync(process.platform === 'darwin' ? 'open' : 'xdg-open', [args[1]!]);
    return out({ opened: args[1] });
  }
  if (cmd === 'shots' && key && args[1]) {
    // The agent's screenshot set: the current page of the ticket's test browser, light and dark, each size.
    const f = await loadFlow(key);
    if (!f?.worktree) {
      throw new Error(`${key}: the ticket has no worktree.`);
    }
    const browser = new TestBrowser(key, { cwd: f.worktree, env: process.env });
    const focus = option('focus') ?? null;
    const { files, misses } = await browser.shots(
      args[1],
      parseSizes(CONFIG.app.shotSizes),
      CONFIG.app.themeKey,
      focus
    );
    process.stdout.write(`${files.join('\n')}\n`);
    if (misses.length) {
      // The shots show the top of the page there, not the part that they are for.
      process.stdout.write(
        `The focus target ${JSON.stringify(focus)} was not found at ${misses.join(', ')}. Give a heading text or a CSS selector that is on the page, and take the set again.\n`
      );
      process.exitCode = 2;
    }
    return;
  }
  if (cmd === 'approve-testing' && key) {
    const info = await ensureService(process.argv[1]!);
    return out(await callService(info, `/tickets/${key}/approve-testing`, {}));
  }
  if (
    (cmd === 'plan' ||
      cmd === 'develop' ||
      cmd === 'test' ||
      cmd === 'review' ||
      cmd === 'gate' ||
      cmd === 'commit-plan' ||
      cmd === 'commit' ||
      cmd === 'stop') &&
    key
  ) {
    const info = cmd !== 'stop' ? await ensureService(process.argv[1]!) : await serviceInfo();
    if (!info) {
      return out({ stopped: false });
    }
    return out(await callService(info, `/tickets/${key}/${cmd}`, {}));
  }
  if (cmd === 'detect') {
    return out(await runDetect());
  }
  if (cmd === 'settings' && args[0] === 'save' && args[1]) {
    return out(await saveSettings(JSON.parse(args.slice(1).join(' ')) as Record<string, string>));
  }
  if (cmd === 'settings' && !args.length) {
    const wanted = flags.has('--detect') || option('only') !== undefined;
    return out(await settingsView(wanted ? await runDetect() : undefined));
  }
  if (cmd === 'config' && !args.length) {
    return out(CONFIG);
  }
  if (cmd === 'config' && args[0] === 'set' && args[1] && args[2] !== undefined) {
    return out(await setConfigValue(args[1], JSON.parse(args.slice(2).join(' '))));
  }
  if (cmd === 'sprint') {
    if (flags.has('--cached')) {
      const cached = await readCache();
      await refreshLocalWork(cached.tickets.map((t) => t.key));
      return out(shapeSprint(cached));
    }
    const [snap] = await Promise.all([refreshSprint(() => undefined), refreshPrs(findPr)]);
    await refreshLocalWork(snap.tickets.map((t) => t.key));
    return out(shapeSprint(snap));
  }
  if (cmd === 'ticket' && key) {
    return out(await ticket(key));
  }
  if (cmd === 'heavy' && (args[0] === 'acquire' || args[0] === 'release') && args[1]) {
    // The guard hook runs heavy commands one at a time: it holds this lock around each one.
    const lock = join(HOME, 'heavy.lock');
    if (args[0] === 'release') {
      releaseHeavy(lock, args[1]);
      return out({ ok: true });
    }
    // The hook that calls this may wait ten minutes at most.
    return out({ ok: await acquireHeavy(lock, args[1], { waitMs: 8 * 60_000 }) });
  }
  if (cmd === 'handoff' && key) {
    const info = await ensureService(process.argv[1]!);
    return out(await callService(info, `/tickets/${key}/handoff`, {}));
  }
  if (cmd === 'handback' && key && args.slice(1).some((a) => a !== '--replan')) {
    const info = await ensureService(process.argv[1]!);
    const summary = args
      .slice(1)
      .filter((a) => a !== '--replan')
      .join(' ');
    return out(
      await callService(info, `/tickets/${key}/handback`, {
        summary,
        replan: args.includes('--replan')
      })
    );
  }
  if (cmd === 'change' && key && args[1]) {
    const info = await ensureService(process.argv[1]!);
    return out(
      await callService(info, `/tickets/${key}/change`, { text: args.slice(1).join(' ') })
    );
  }
  if (cmd === 'comment' && key && args[1]) {
    return out(await addComment(key, args.slice(1).join(' '), flags.has('--run')));
  }
  if ((cmd === 'adopt' || cmd === 'ignore') && key) {
    const t = (await readCache()).tickets.find((x) => x.key === key);
    if (t) {
      STATUS[key] = t.status;
    }
    await refreshLocalWork([key]);
    if (cmd === 'ignore') {
      await ignoreWork(key);
      return out({ ignored: key });
    }
    const stage = option('stage') ?? adoptOffer(key)?.stage;
    if (!stage || !isStage(stage)) {
      throw new Error(`${key}: nothing to adopt, or an unknown stage.`);
    }
    return out(await adoptWork(key, stage));
  }
  if (cmd === 'move' && key && args[1]) {
    const from = (await readCache()).tickets.find((t) => t.key === key)?.status;
    return out(
      await moveTicket(
        key,
        args.slice(1).join(' '),
        flags.has('--approved') ? 'you' : 'agent',
        from
      )
    );
  }
  if (cmd === 'after-merge' && key && args[1]) {
    const to = args.slice(1).join(' ');
    return out(await setAfterMerge(key, to === 'default' ? null : to));
  }
  if (cmd === 'agent-may-move' && key && /^(on|off)$/.test(args[1] ?? '')) {
    return out(await setAgentMayMove(key, args[1] === 'on'));
  }
  process.stderr.write(USAGE);
  process.exit(2);
}

main().catch((e: unknown) => {
  process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
