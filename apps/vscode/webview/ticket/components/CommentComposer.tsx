import { Label as AriaLabel, TextArea, TextField } from 'react-aria-components';
import { Button } from '../../shared/components/Button';
import { Kbd } from '../../shared/components/Kbd';

type Props = { draft: string; setDraft: (s: string) => void; post: (run: boolean) => void };

export function CommentComposer({ draft, setDraft, post }: Props) {
  const empty = !draft.trim();

  return (
    <>
      <TextField
        value={draft}
        onChange={setDraft}
        className="grid gap-2 pt-1"
        aria-label="Comment for the agent"
      >
        <AriaLabel className="sr-only">Comment for the agent</AriaLabel>
        <TextArea
          id="draft"
          placeholder="The agent reads every comment at the start of its next run."
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              post(e.shiftKey);
            }
            if (e.key === 'Escape') {
              e.currentTarget.blur();
            }
          }}
          className="min-h-[76px] w-full resize-y rounded-lg border border-ink/10 bg-ink/[0.03] px-3 py-2 text-ink/90 transition-colors placeholder:text-muted focus:border-ink/30 focus:bg-ink/[0.05] light:bg-base"
        />
      </TextField>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="mr-auto text-[11px] text-muted">
          <Kbd>⌘</Kbd> <Kbd>Enter</Kbd> to comment
        </span>
        <Button onPress={() => post(false)} isDisabled={empty}>
          Comment
        </Button>
        <Button onPress={() => post(true)} isDisabled={empty}>
          Comment and resume agent
        </Button>
      </div>
    </>
  );
}
