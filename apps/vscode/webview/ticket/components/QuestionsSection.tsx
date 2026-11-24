import { mdiHelpCircleOutline } from '@mdi/js';
import { Section } from '../../shared/components/Section';
import type { Question } from '../../shared/types/host';
import type { Theme } from '../../shared/types/theme';
import { QuestionCard } from './QuestionCard';

type Props = { ticketKey: string; questions: Question[]; theme: Theme };

/** The plan's questions, first on the Planning tab, each with a way to answer. */
export function QuestionsSection({ ticketKey, questions, theme }: Props) {
  const open = questions.filter((q) => !q.a).length;

  return (
    <Section
      icon={mdiHelpCircleOutline}
      title="Questions"
      caption={
        open
          ? 'Your answers change what gets built. Re-plan when you have answered them.'
          : 'All answered. Re-plan to use your answers.'
      }
      aside={open ? `${open} open` : 'All answered'}
      accent="violet"
      theme={theme}
    >
      <ol className="m-0 list-none p-0">
        {questions.map((q, i) => (
          <QuestionCard key={`${i}-${q.q}`} ticketKey={ticketKey} n={i + 1} q={q} theme={theme} />
        ))}
      </ol>
    </Section>
  );
}
