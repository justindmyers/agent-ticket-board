import { useState } from 'react';
import { Label, TextArea, TextField } from 'react-aria-components';
import { Button } from '../../shared/components/Button';
import { LinkButton } from '../../shared/components/LinkButton';
import type { Answered } from '../../shared/types/host';
import { send } from '../../shared/utils/vscodeApi';

type Props = { ticketKey: string; n: number; x: Answered };

/** One answer from an earlier plan, with Change. */
export function EarlierAnswer({ ticketKey, n, x }: Props) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(x.a);

  return (
    <li className="grid gap-1 border-t border-ink/[0.06] py-2 first:border-t-0">
      <p className="m-0 leading-snug [overflow-wrap:anywhere] text-ink/85">{x.q}</p>
      {editing ? (
        <>
          <TextField value={text} onChange={setText} aria-label={`Earlier answer ${n}`}>
            <Label className="sr-only">{`Earlier answer ${n}`}</Label>
            <TextArea className="min-h-[48px] w-full resize-y rounded-lg border border-ink/10 bg-ink/[0.03] px-3 py-2 text-[12.5px] text-ink/90 focus:border-ink/30 light:bg-base" />
          </TextField>
          <div className="flex flex-wrap gap-2">
            <Button
              isDisabled={!text.trim() || text.trim() === x.a}
              aria-label={`Save earlier answer ${n}`}
              onPress={() => {
                send({ type: 'answer', key: ticketKey, n, text, earlier: true });
                setEditing(false);
              }}
            >
              Save answer
            </Button>
            <Button variant="ghost" onPress={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </>
      ) : (
        <p className="m-0 flex flex-wrap items-baseline gap-x-2 text-[12.5px]">
          <span className="text-muted">Your answer:</span>
          <span className="[overflow-wrap:anywhere] text-ink/90">{x.a}</span>
          <LinkButton
            className="text-[12px] underline decoration-ink/30 underline-offset-2"
            onPress={() => {
              setText(x.a);
              setEditing(true);
            }}
            aria-label={`Change earlier answer ${n}`}
          >
            Change
          </LinkButton>
        </p>
      )}
    </li>
  );
}
