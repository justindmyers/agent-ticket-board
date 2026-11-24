// The text form of each config value. No imports: the Claude Code plugin gets a verbatim copy.

export type FieldKind = 'text' | 'optionalText' | 'list' | 'port' | 'portRange' | 'rules';

type Rule = { branch: string; to: string | null };

const ASK = 'ask me';
const ARROW = /\s*(?:=>|->|→)\s*/;

const formatRule = (r: Rule) => `${r.branch} => ${r.to ?? ASK}`;

function parseRule(text: string): Rule | null {
  const [branch = '', to = ''] = text.split(ARROW);
  if (!branch.trim()) {
    return null;
  }
  const status = to.trim();
  return { branch: branch.trim(), to: !status || status === ASK ? null : status };
}

const FORMAT: Record<FieldKind, (v: unknown) => string> = {
  text: (v) => String(v ?? ''),
  optionalText: (v) => String(v ?? ''),
  list: (v) => (v as string[]).join(', '),
  port: (v) => String(v),
  portRange: (v) => (v as number[]).join('-'),
  rules: (v) => (v as Rule[]).map(formatRule).join('; ')
};

const PARSE: Record<FieldKind, (t: string) => unknown> = {
  text: (t) => t.trim(),
  optionalText: (t) => t.trim() || null,
  list: (t) =>
    t
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean),
  port: (t) => (/^\s*\d+\s*$/.test(t) ? Number(t) : t),
  portRange: (t) => {
    const m = t.match(/^\s*(\d+)\s*-\s*(\d+)\s*$/);
    return m ? [Number(m[1]), Number(m[2])] : t;
  },
  rules: (t) =>
    t
      .split(';')
      .map(parseRule)
      .filter((r): r is Rule => r !== null)
};

const isRegExp = (pattern: string) => {
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
};

/** Why one list item or branch pattern cannot go into the field text, or null when it can. */
export function itemProblem(kind: 'list' | 'rules', item: string): string | null {
  if (!item.trim()) {
    return 'Type a value first.';
  }
  if (kind === 'list') {
    return item.includes(',') ? 'An item cannot contain a comma.' : null;
  }
  if (item.includes(';') || ARROW.test(item)) {
    return 'A branch pattern cannot contain ; or =>.';
  }
  return isRegExp(item) ? null : 'This is not a valid regular expression.';
}

export const isPattern = isRegExp;

export const formatValue = (kind: FieldKind, value: unknown): string => FORMAT[kind](value);

export const parseValue = (kind: FieldKind, text: string): unknown => PARSE[kind](text);
