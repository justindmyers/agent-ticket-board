import type { Detail } from '../../shared/types/host';
import type { StageId } from '../../shared/types/stage';
import type { Theme } from '../../shared/types/theme';
import { stageIndex, STAGES } from '../../shared/utils/stages';
import type { Act } from '../types/ticket';
import { CodeReviewStage } from './CodeReviewStage';
import { DevelopmentStage } from './DevelopmentStage';
import { PlanningStage } from './PlanningStage';
import { TestingStage } from './TestingStage';

type Props = { id: StageId; d: Detail; act: Act; theme: Theme };

export function StageBody({ id, d, act, theme }: Props) {
  const f = d.flow;
  const si = f?.closed ? STAGES.length - 1 : stageIndex(f);
  const ti = STAGES.findIndex((s) => s.id === id);
  if (id === 'planning') {
    return <PlanningStage d={d} act={act} theme={theme} />;
  }
  if (!f || ti > si) {
    return (
      <p className="px-1 py-2 text-muted">
        {STAGES[ti].label} starts after {STAGES[ti - 1].label.toLowerCase()}.
      </p>
    );
  }
  if (id === 'development') {
    return <DevelopmentStage f={f} act={act} theme={theme} />;
  }
  if (id === 'testing') {
    return <TestingStage f={f} act={act} theme={theme} />;
  }
  return <CodeReviewStage f={f} act={act} theme={theme} />;
}
