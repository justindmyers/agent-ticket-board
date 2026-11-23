import { Tab, TabList } from 'react-aria-components';
import type { Theme } from '../../shared/types/theme';
import { cx } from '../../shared/utils/cx';
import { STAGES } from '../../shared/utils/stages';
import { StageTabContent } from './StageTabContent';

type Props = { current: number; theme: Theme };

const SELECTED =
  'bg-ink/[0.12] font-medium text-ink shadow-[inset_0_1px_0_rgb(255_255_255/0.08)] hc:bg-transparent hc:outline hc:outline-1 hc:outline-[var(--vscode-focusBorder)] light:bg-base light:shadow-[0_1px_2px_rgb(12_29_73/0.12)]';

export function StageTabList({ current, theme }: Props) {
  return (
    <TabList
      aria-label="Stages"
      className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-full border border-ink/10 bg-base/70 p-1 light:bg-ink/[0.03]"
    >
      {STAGES.map((s, i) => (
        <Tab
          key={s.id}
          id={s.id}
          className={({ isSelected, isFocusVisible, isHovered }) =>
            cx(
              'flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] whitespace-nowrap transition-colors duration-200 outline-none',
              isSelected ? SELECTED : isHovered ? 'text-ink/90' : 'text-muted',
              isFocusVisible && 'ring-2 ring-ink/40'
            )
          }
        >
          <StageTabContent
            stage={s}
            state={i < current ? 'done' : i === current ? 'current' : 'todo'}
            theme={theme}
          />
        </Tab>
      ))}
    </TabList>
  );
}
