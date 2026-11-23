import { COMMENTS_FILE } from './paths';
import { readJson, writeJson } from './files';

// The comment thread for each ticket. The board owns it and never writes it to Jira.
export type Comment = {
  id: string;
  key: string;
  author: 'you' | 'agent';
  text: string;
  at: string;
  ran?: boolean;
};

const all = () => readJson<Comment[]>(COMMENTS_FILE, []);

export async function listComments(key: string) {
  return (await all())
    .filter((c) => c.key === key && c.author === 'you')
    .sort((a, b) => a.at.localeCompare(b.at));
}

export async function addComment(key: string, text: string, ran: boolean): Promise<Comment> {
  const list = await all();
  const c: Comment = {
    id: Date.now().toString(36),
    key,
    author: 'you',
    text,
    at: new Date().toISOString(),
    ran
  };
  list.push(c);
  await writeJson(COMMENTS_FILE, list);
  return c;
}
