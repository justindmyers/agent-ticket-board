// Every text value goes through escape(); the webview CSP allows no inline script.
import { escape } from 'lodash-es';
import type { AdfNode, AdfSection } from '../types/adf';

export function adfHtml(node: AdfNode | AdfNode[] | undefined | null): string {
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
      return '@' + escape(node.attrs?.text?.replace(/^@/, ''));
    case 'inlineCard':
    case 'blockCard':
      return escape(node.attrs?.url);
    case 'media':
    case 'mediaSingle':
    case 'mediaGroup':
      return '<p><em>Attachment: open in Jira</em></p>';
    case 'text': {
      let t = escape(node.text);
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

const plain = (n?: AdfNode): string =>
  n ? (n.text ?? '') + (n.content ?? []).map(plain).join('') : '';

const kindOf = (title: string | null): AdfSection['kind'] =>
  title === null
    ? 'context'
    : /acceptance/i.test(title)
      ? 'acceptance'
      : /claude|agent|\bai\b|take|analysis|notes?/i.test(title)
        ? 'notes'
        : 'other';

// A top-level heading, or a paragraph that is only bold text, starts a new section.
export function sections(doc: unknown): AdfSection[] {
  const blocks: AdfNode[] = (doc as AdfNode | null)?.content ?? [];
  const out: { title: string | null; nodes: AdfNode[] }[] = [{ title: null, nodes: [] }];
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
    .map((s) => ({ title: s.title, kind: kindOf(s.title), html: adfHtml(s.nodes) }));
}
