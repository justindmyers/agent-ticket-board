import { mdiChevronDown, mdiHistory } from '@mdi/js';
import { useState } from 'react';
import { Disclosure, DisclosurePanel, Heading } from 'react-aria-components';
import { Button } from '../../shared/components/Button';
import { Icon } from '../../shared/components/Icon';
import { Section } from '../../shared/components/Section';
import type { Answered } from '../../shared/types/host';
import type { Theme } from '../../shared/types/theme';
import { cx } from '../../shared/utils/cx';
import { EarlierAnswer } from './EarlierAnswer';

type Props = { ticketKey: string; answered: Answered[]; theme: Theme };

/** The answers that the plan is based on, from earlier plans. Collapsed until the developer opens it. */
export function EarlierAnswers({ ticketKey, answered, theme }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <Section
      icon={mdiHistory}
      title="Earlier answers"
      caption="The plan is based on these. A change asks for a re-plan."
      aside={answered.length}
      accent="violet"
      theme={theme}
    >
      <Disclosure isExpanded={open} onExpandedChange={setOpen}>
        <Heading className="m-0">
          <Button slot="trigger" variant="ghost" className="h-7 gap-1.5 px-1 text-[12px]">
            <Icon
              path={mdiChevronDown}
              size={14}
              className={cx(
                'text-muted transition-transform duration-200 ease-soft motion-reduce:transition-none',
                !open && '-rotate-90'
              )}
            />
            {open ? 'Hide earlier answers' : `Show ${answered.length} earlier answers`}
          </Button>
        </Heading>
        <DisclosurePanel className="h-(--disclosure-panel-height) overflow-clip transition-[height] duration-200 ease-soft motion-reduce:transition-none">
          <ol className="m-0 list-none p-0">
            {answered.map((x, i) => (
              <EarlierAnswer key={`${i}-${x.q}`} ticketKey={ticketKey} n={i + 1} x={x} />
            ))}
          </ol>
        </DisclosurePanel>
      </Disclosure>
    </Section>
  );
}
