// atb: the shared command line for every client; the Claude Code pane reaches core only through it.
// Run it with no command for the usage. JSON goes to stdout.
import {
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
  isStage
} from '@agent-ticket-board/core';

const USAGE = `usage:
  atb sprint [--cached]                  sprint snapshot (cached: from ~/.agent-ticket-board/cache)
  atb ticket <KEY> [--cached]            ticket detail, agent record, comments and group
  atb comment <KEY> <text> [--run]       a comment for the agent (never sent to Jira)
  atb move <KEY> <STATUS> [--approved]   a Jira move by the agent, or one that the developer approved
  atb agent-may-move <KEY> on|off        the developer's permission for one ticket
  atb after-merge <KEY> <STATUS>|default the status for this ticket after its merge
  atb adopt <KEY> [--stage=<stage>]      take over the local work for a ticket (agent record only)
  atb ignore <KEY>                       hide the local branch for a ticket
  atb detect [--repo=<path>] [--only=tracker|repo]   proposed config values; writes nothing
  atb config [set <key> <json>]          the config, or one value that the developer accepted
  atb settings [--detect] [--only=…] | atb settings save <json>   the settings view
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
