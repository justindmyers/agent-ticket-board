import { mdiForumOutline } from '@mdi/js';
import { Section } from '../../shared/components/Section';
import type { Detail } from '../../shared/types/host';
import type { Theme } from '../../shared/types/theme';
import { send } from '../../shared/utils/vscodeApi';
import { CommentComposer } from './CommentComposer';
import { CommentList } from './CommentList';

type Props = { d: Detail; draft: string; setDraft: (s: string) => void; theme: Theme };

export function CommentsSection({ d, draft, setDraft, theme }: Props) {
  const post = (run: boolean) => {
    const text = draft.trim();
    if (!text) {
      return;
    }
    send({ type: 'comment', key: d.ticket.key, text, run });
    setDraft('');
  };

  return (
    <Section
      icon={mdiForumOutline}
      title="Comments for the agent"
      caption="Saved on this machine, never sent to Jira"
      aside={d.comments.length || undefined}
      accent="violet"
      theme={theme}
    >
      <CommentList comments={d.comments} theme={theme} />
      <CommentComposer draft={draft} setDraft={setDraft} post={post} />
    </Section>
  );
}
