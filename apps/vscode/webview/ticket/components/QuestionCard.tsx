import { useState } from 'react';
import { Label, Radio, RadioGroup, TextArea, TextField } from 'react-aria-components';
import { Button } from '../../shared/components/Button';
import { LinkButton } from '../../shared/components/LinkButton';
import type { Question } from '../../shared/types/host';
import type { Theme } from '../../shared/types/theme';
import { cx } from '../../shared/utils/cx';
import { ink } from '../../shared/utils/surfaces';
import { send } from '../../shared/utils/vscodeApi';
import { RadioDot } from './RadioDot';

type Props = { ticketKey: string; n: number; q: Question; theme: Theme };

const OTHER = 'other';

const radio = (selected: boolean) =>
  cx(
    'flex cursor-pointer items-start gap-2 rounded-md border px-2.5 py-1.5 text-[12.5px] outline-none transition-colors motion-reduce:transition-none data-focus-visible:ring-2 data-focus-visible:ring-ink/40',
    selected
      ? 'border-ink/30 bg-ink/[0.07] text-ink'
      : 'border-ink/10 text-ink/85 hover:bg-ink/[0.04]'
  );

/** One planning question: why it matters, the options (the recommended one first marked), or free text. */
export function QuestionCard({ ticketKey, n, q, theme }: Props) {
  const options = q.options ?? [];
  const known = q.a !== undefined && options.includes(q.a);
  const [editing, setEditing] = useState(!q.a);
  const [choice, setChoice] = useState(q.a ? (known ? q.a : OTHER) : '');
  const [other, setOther] = useState(q.a && !known ? q.a : '');
  const answer = choice === OTHER || !options.length ? other.trim() : choice;
  const save = () => {
    send({ type: 'answer', key: ticketKey, n, text: answer });
    setEditing(false);
  };

  return (
    <li className="grid gap-2 border-t border-ink/[0.06] py-3 first:border-t-0 first:pt-1">
      <p className="m-0 leading-snug [overflow-wrap:anywhere] text-ink/90">
        <span className="mr-2 font-mono text-[11px] text-muted">{n}</span>
        {q.q}
      </p>
      {q.why && <p className="m-0 text-[12px] leading-snug text-muted">{q.why}</p>}

      {!editing && q.a ? (
        <p className="m-0 flex flex-wrap items-baseline gap-x-2 text-[12.5px]">
          <span className="text-muted">Your answer:</span>
          <span className="text-ink/90">{q.a}</span>
          <LinkButton
            className="text-[12px] underline decoration-ink/30 underline-offset-2"
            onPress={() => setEditing(true)}
            aria-label={`Change the answer to question ${n}`}
          >
            Change
          </LinkButton>
        </p>
      ) : (
        <>
          {options.length > 0 && (
            <RadioGroup
              value={choice}
              onChange={setChoice}
              aria-label={`Answers to question ${n}`}
              className="grid gap-1.5"
            >
              {options.map((o, i) => (
                <Radio key={o} value={o} className={({ isSelected }) => radio(isSelected)}>
                  {({ isSelected }) => (
                    <>
                      <RadioDot selected={isSelected} />
                      <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{o}</span>
                      {q.recommended === i && (
                        <span
                          className="shrink-0 text-[11px]"
                          style={{ color: ink('blue', theme) }}
                        >
                          Recommended
                        </span>
                      )}
                    </>
                  )}
                </Radio>
              ))}
              <Radio
                value={OTHER}
                aria-label={`Other answer to question ${n}`}
                className={({ isSelected }) => radio(isSelected)}
              >
                {({ isSelected }) => (
                  <>
                    <RadioDot selected={isSelected} />
                    Other answer
                  </>
                )}
              </Radio>
            </RadioGroup>
          )}
          {(choice === OTHER || !options.length) && (
            <TextField
              value={other}
              onChange={setOther}
              aria-label={`Your answer to question ${n}`}
            >
              <Label className="sr-only">{`Your answer to question ${n}`}</Label>
              <TextArea
                placeholder="Your answer"
                className="min-h-[56px] w-full resize-y rounded-lg border border-ink/10 bg-ink/[0.03] px-3 py-2 text-[12.5px] text-ink/90 placeholder:text-muted focus:border-ink/30 light:bg-base"
              />
            </TextField>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              onPress={save}
              isDisabled={!answer}
              aria-label={`Save the answer to question ${n}`}
            >
              Save answer
            </Button>
            {q.a && (
              <Button variant="ghost" onPress={() => setEditing(false)}>
                Cancel
              </Button>
            )}
          </div>
        </>
      )}
    </li>
  );
}
