// Jira description (ADF) -> HTML, split into sections by heading, so notes that someone added to the
// ticket (for example an agent's analysis) do not hide inside the description.
const esc = (s: unknown) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!
  );

type Attrs = { href?: string; text?: string; url?: string; level?: number; language?: string };
type Node = {
  type: string;
  text?: string;
  attrs?: Attrs;
  marks?: { type: string; attrs?: Attrs }[];
  content?: Node[];
};

// Every text value goes through esc(); the webview CSP allows no inline script.
export function adfHtml(node: Node | Node[] | undefined | null): string {
  if (!node) {
    return '';
  }
  if (Array.isArray(node)) {
    return node.map(adfHtml).join('');
  }
  const k = adfHtml(node.content);
  switch (node.type) {
    case 'doc':
      return k;
    case 'paragraph':
      return `<p>${k}</p>`;
    case 'heading':
      return `<p><strong>${k}</strong></p>`;
    case 'bulletList':
      return `<ul>${k}</ul>`;
    case 'orderedList':
      return `<ol>${k}</ol>`;
    case 'listItem':
      return `<li>${k}</li>`;
    case 'codeBlock':
      return `<pre><code>${k}</code></pre>`;
    case 'hardBreak':
      return '<br>';
    case 'mention':
      return '@' + esc(node.attrs?.text?.replace(/^@/, ''));
    case 'inlineCard':
    case 'blockCard':
      return esc(node.attrs?.url);
    case 'media':
    case 'mediaSingle':
    case 'mediaGroup':
      return '<p><em>Attachment: open in Jira</em></p>';
    case 'text': {
      let t = esc(node.text);
      for (const m of node.marks ?? []) {
        if (m.type === 'strong') {
          t = `<strong>${t}</strong>`;
        } else if (m.type === 'em') {
          t = `<em>${t}</em>`;
        } else if (m.type === 'code') {
          t = `<code>${t}</code>`;
        }
      }
      return t;
    }
    default:
      return k;
  }
}

const plain = (n?: Node): string =>
  n ? (n.text ?? '') + (n.content ?? []).map(plain).join('') : '';

export type Section = {
  title: string | null;
  kind: 'context' | 'acceptance' | 'notes' | 'other';
  html: string;
};

/** Top-level headings (or a paragraph that is only bold text) start a new section. */
export function sections(doc: unknown): Section[] {
  const blocks: Node[] = (doc as Node | null)?.content ?? [];
  const out: { title: string | null; nodes: Node[] }[] = [{ title: null, nodes: [] }];
  for (const b of blocks) {
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
      html: adfHtml(s.nodes)
    }));
}
