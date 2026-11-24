// atb: the shared command line. Every client can call it; the Claude Code pane uses it.
//   atb sprint [--cached]                 sprint snapshot as JSON (cached: from ~/.agent-ticket-board/cache)
//   atb ticket <KEY> [--cached]           ticket detail, agent record, comments and group
//   atb comment <KEY> <text> [--run]      a comment for the agent (never sent to Jira)
//   atb move <KEY> <STATUS>               the agent moves a ticket (only where the developer allowed it)
//   atb move <KEY> <STATUS> --approved    a move that the developer approved in a client
//   atb agent-may-move <KEY> on|off       the developer's permission for one ticket
//   atb after-merge <KEY> <STATUS>|default   the status for this ticket after its merge
//   atb detect [--repo=<path>] [--only=tracker|repo]   proposed config values; writes nothing
//   atb config [set <key> <json>]          the config, or one value that the developer accepted
//   atb settings [--detect] [--only=…] [--repo=…] | atb settings save <json>   the settings view
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
  ticketUrl
} from '@agent-ticket-board/core';

const USAGE =
  'usage: atb sprint [--cached] | atb ticket <KEY> [--cached] | atb comment <KEY> <text> [--run] | ' +
  'atb move <KEY> <STATUS> [--approved] | atb agent-may-move <KEY> on|off | atb after-merge <KEY> <STATUS>|default | ' +
  'atb detect [--repo=<path>] [--only=tracker|repo] | atb config [set <key> <json>] | ' +
  'atb settings [--detect] [--only=tracker|repo] | atb settings save <json>\n';

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
  if (!flags.has('--cached')) {
    await refreshPrs(findPr, [key]);
  }
  const sections = t.description ? mdSections(t.description) : t.description === null ? [] : null;
  return {
    ticket: t,
    group: groupOf(t, agentFor(key)),
    agent: agentFor(key),
    flow: flowFor(key),
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
      return out(shapeSprint(await readCache()));
    }
    const [snap] = await Promise.all([refreshSprint(() => undefined), refreshPrs(findPr)]);
    return out(shapeSprint(snap));
  }
  if (cmd === 'ticket' && key) {
    return out(await ticket(key));
  }
  if (cmd === 'comment' && key && args[1]) {
    return out(await addComment(key, args.slice(1).join(' '), flags.has('--run')));
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
