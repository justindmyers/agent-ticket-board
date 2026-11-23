import type { Agent } from '../types/host';
import type { Theme } from '../types/theme';
import { cx } from '../utils/cx';
import { ink } from '../utils/surfaces';

type Props = { agent: Agent; theme: Theme; className?: string };

export function AgentAsk({ agent, theme, className }: Props) {
  const problem = agent.kind === 'problem';

  return (
    <span
      className={cx('text-[12px] leading-snug', className)}
      style={{ color: ink(problem ? 'red' : 'violet', theme) }}
    >
      <span className="sr-only">{problem ? 'Problem: ' : 'Agent needs you: '}</span>
      {agent.ask}
    </span>
  );
}
