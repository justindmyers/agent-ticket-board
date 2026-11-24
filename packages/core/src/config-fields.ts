export type FieldKind = 'text' | 'optionalText' | 'list' | 'port' | 'portRange' | 'rules';

export type ConfigField = { key: string; label: string; help: string; kind: FieldKind };

export type ConfigSection = {
  id: 'tracker' | 'repo' | 'app';
  title: string;
  fields: ConfigField[];
};

export const CONFIG_SECTIONS: ConfigSection[] = [
  {
    id: 'tracker',
    title: 'Tracker',
    fields: [
      {
        key: 'tracker.site',
        label: 'Jira site',
        help: 'The host name of your Jira site.',
        kind: 'text'
      },
      {
        key: 'tracker.project',
        label: 'Project key',
        help: 'The key before the ticket number.',
        kind: 'text'
      },
      {
        key: 'tracker.jql',
        label: 'Sprint query',
        help: 'The JQL that finds your tickets.',
        kind: 'text'
      },
      {
        key: 'tracker.pointsField',
        label: 'Points field',
        help: 'The custom field that holds the story points. Empty means no points.',
        kind: 'optionalText'
      },
      {
        key: 'tracker.columns',
        label: 'Board columns',
        help: 'Jira statuses, in board order.',
        kind: 'list'
      },
      {
        key: 'tracker.finished',
        label: 'Finished statuses',
        help: 'A ticket in one of these statuses is finished.',
        kind: 'list'
      },
      {
        key: 'tracker.afterMerge',
        label: 'Status after the merge',
        help: 'The default Jira status when a pull request merges.',
        kind: 'text'
      },
      {
        key: 'tracker.afterMergeRules',
        label: 'Branch rules after the merge',
        help: 'A rule matches the branch of the pull request. No status means: ask me.',
        kind: 'rules'
      }
    ]
  },
  {
    id: 'repo',
    title: 'Repository',
    fields: [
      {
        key: 'repo.path',
        label: 'Folder',
        help: 'The local folder of the repository.',
        kind: 'optionalText'
      },
      {
        key: 'repo.remote',
        label: 'GitHub repository',
        help: 'The owner and the name.',
        kind: 'optionalText'
      },
      {
        key: 'repo.worktreeScript',
        label: 'Worktree script',
        help: 'The command that makes a worktree for a ticket.',
        kind: 'optionalText'
      },
      {
        key: 'repo.branch',
        label: 'Branch name',
        help: 'A template with {type}, {key} and {slug}.',
        kind: 'text'
      },
      {
        key: 'repo.prTitle',
        label: 'Pull request title',
        help: 'A template with {type}, {scope}, {description} and {key}.',
        kind: 'optionalText'
      }
    ]
  },
  {
    id: 'app',
    title: 'App under test',
    fields: [
      {
        key: 'app.devCommand',
        label: 'Dev command',
        help: 'The command that starts the app. {port} is the leased port.',
        kind: 'optionalText'
      },
      {
        key: 'app.ownerPort',
        label: 'Your port',
        help: 'The agent never uses this port.',
        kind: 'port'
      },
      {
        key: 'app.buildPorts',
        label: 'Ports for builds',
        help: 'The first and the last port that a build can lease.',
        kind: 'portRange'
      }
    ]
  }
];

export const CONFIG_FIELDS = CONFIG_SECTIONS.flatMap((s) => s.fields);

const isPort = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 65535;

const isRule = (v: unknown) => {
  const r = v as { branch?: unknown; to?: unknown } | null;
  return typeof r?.branch === 'string' && (typeof r.to === 'string' || r.to === null);
};

const CHECKS: Record<FieldKind, [(v: unknown) => boolean, string]> = {
  text: [(v) => typeof v === 'string', 'must be text'],
  optionalText: [(v) => typeof v === 'string' || v === null, 'must be text or empty'],
  list: [
    (v) => Array.isArray(v) && v.every((x) => typeof x === 'string'),
    'must be a list of text'
  ],
  port: [isPort, 'must be a port number from 1 to 65535'],
  portRange: [
    (v) => Array.isArray(v) && v.length === 2 && v.every(isPort) && v[0] <= v[1],
    'must be two port numbers, the first not more than the last'
  ],
  rules: [
    (v) => Array.isArray(v) && v.every(isRule),
    'must be a list of rules with a branch and a status or null'
  ]
};

export function checkValue(field: ConfigField, value: unknown): string | null {
  const [ok, message] = CHECKS[field.kind];
  return ok(value) ? null : `${field.label} ${message}`;
}
