import { mdiImageOutline } from '@mdi/js';
import { shotLabel } from '@agent-ticket-board/core/look';
import { Button } from '../../shared/components/Button';
import { Icon } from '../../shared/components/Icon';
import type { Act } from '../types/ticket';

type Props = { reqId: string; set: string; shots: string[]; named: boolean; act: Act };

/**
 * One screenshot set of a requirement: a line for each size, with its light and dark shots side by
 * side. The set is named when the requirement has more than one.
 */
export function ShotSet({ reqId, set, shots, named, act }: Props) {
  const sizes = [...new Set(shots.map((s) => shotLabel(s).split(' ')[1] ?? ''))];
  return (
    <span className="mt-1.5 block">
      {named && <span className="mb-1 block font-mono text-[11px] text-muted">{set}</span>}
      <span className="grid w-fit grid-cols-[auto_auto_auto] items-center gap-x-1.5 gap-y-1">
        {sizes.map((size) => (
          <span key={size} className="contents">
            <span className="pr-1 font-mono text-[11px] text-muted">{size || 'other'}</span>
            {['light', 'dark'].map((scheme) => {
              const s = shots.find((x) => shotLabel(x) === `${scheme} ${size}`);
              return s ? (
                <Button
                  key={scheme}
                  variant="default"
                  aria-label={`Open the ${named ? `${set} ` : ''}${shotLabel(s)} screenshot of ${reqId}`}
                  onPress={() => act(`openShot:${s}`)}
                >
                  <Icon path={mdiImageOutline} size={14} />
                  {scheme}
                </Button>
              ) : (
                <span key={scheme} />
              );
            })}
          </span>
        ))}
      </span>
    </span>
  );
}
