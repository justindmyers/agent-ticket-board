// Jira description (ADF) -> Markdown sections, for clients that draw Markdown (the Claude Code pane, the CLI).
// The VS Code webview has its own HTML version in webview/adf.ts with the same section rules.
type Attrs = { href?: string; text?: string; url?: string };
type Node = {
  type: string;
  text?: string;
  attrs?: Attrs;
  marks?: { type: string; attrs?: Attrs }[];
  content?: Node[];
};

function inline(n: Node): string {
  if (n.type === 'text') {
    let t = n.text ?? '';
    for (const m of n.marks ?? []) {
      if (m.type === 'strong') {
        t = `**${t}**`;
      } else if (m.type === 'em') {
        t = `*${t}*`;
      } else if (m.type === 'code') {
        t = '`' + t + '`';
      } else if (m.type === 'link' && m.attrs?.href) {
        t = `[${t}](${m.attrs.href})`;
      }
    }
    return t;
  }
  if (n.type === 'hardBreak') {
    return '  \n';
  }
  if (n.type === 'mention') {
    return '@' + String(n.attrs?.text ?? '').replace(/^@/, '');
  }
  if (n.type === 'inlineCard') {
    return n.attrs?.url ?? '';
  }
  return (n.content ?? []).map(inline).join('');
}

function block(n: Node, depth = 0): string {
  const pad = '  '.repeat(depth);
  switch (n.type) {
    case 'paragraph':
      return inline(n);
    case 'heading':
      return `**${inline(n)}**`;
    case 'bulletList':
      return (n.content ?? [])
        .map((li) => pad + '- ' + (li.content ?? []).map((c) => block(c, depth + 1)).join('\n'))
        .join('\n');
    case 'orderedList':
      return (n.content ?? [])
        .map(
          (li, i) =>
            pad + `${i + 1}. ` + (li.content ?? []).map((c) => block(c, depth + 1)).join('\n')
        )
        .join('\n');
    case 'codeBlock':
      return '```\n' + (n.content ?? []).map(inline).join('') + '\n```';
    case 'mediaSingle':
    case 'mediaGroup':
    case 'media':
      return '*Attachment: open in Jira*';
    case 'rule':
      return '---';
    default:
      return (n.content ?? []).map((c) => block(c, depth)).join('\n\n');
  }
}

const plain = (n?: Node): string =>
  n ? (n.text ?? '') + (n.content ?? []).map(plain).join('') : '';

export type MdSection = {
  title: string | null;
  kind: 'context' | 'acceptance' | 'notes' | 'other';
  md: string;
};

/** Top-level headings (or a paragraph that is only bold text) start a new section. */
export function mdSections(doc: unknown): MdSection[] {
  const out: { title: string | null; nodes: Node[] }[] = [{ title: null, nodes: [] }];
  for (const b of ((doc as Node | null)?.content ?? []) as Node[]) {
    const boldOnly =
      b.type === 'paragraph' &&
      b.content?.length &&
      b.content.every((c) => c.type === 'text' && c.marks?.some((m) => m.type === 'strong'));
    if (b.type === 'heading' || boldOnly) {
      out.push({ title: plain(b).trim().replace(/:$/, ''), nodes: [] });
    } else {
      out[out.length - 1].nodes.push(b);
    }
  }
  return out
    .filter((s) => s.nodes.length)
    .map((s) => ({
      title: s.title,
      kind:
        s.title === null
          ? 'context'
          : /acceptance/i.test(s.title)
            ? 'acceptance'
            : /claude|agent|\bai\b|take|analysis|notes?/i.test(s.title)
              ? 'notes'
              : 'other',
      md: s.nodes.map((n) => block(n)).join('\n\n')
    }));
}
