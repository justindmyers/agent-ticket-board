import { mdiChevronLeft, mdiChevronRight } from '@mdi/js';
import { Button } from '../../shared/components/Button';
import { Dot } from '../../shared/components/Dot';
import { Icon } from '../../shared/components/Icon';
import type { Theme } from '../../shared/types/theme';
import { cx } from '../../shared/utils/cx';
import { send } from '../../shared/utils/vscodeApi';
import type { BoardTicket } from '../types/board';
import { statusDot } from '../utils/columns';
import { DRAG_TYPE, readDragCard } from '../utils/drag';
import { BoardCard } from './BoardCard';

type Props = {
  status: string;
  items: BoardTicket[];
  loading: boolean;
  closed: boolean;
  onToggle: () => void;
  over: boolean;
  setOver: (f: (o: string | null) => string | null) => void;
  statuses: string[];
  theme: Theme;
};

export function BoardColumn({
  status,
  items,
  loading,
  closed,
  onToggle,
  over,
  setOver,
  statuses,
  theme
}: Props) {
  return (
    <section
      aria-label={`${status}, ${items.length} tickets`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(() => status);
      }}
      onDragLeave={() => setOver((o) => (o === status ? null : o))}
      onDrop={(e) => {
        e.preventDefault();
        setOver(() => null);
        const card = readDragCard(e.dataTransfer.getData(DRAG_TYPE));
        if (card && card.from !== status) {
          send({ type: 'move', key: card.key, from: card.from, to: status });
        }
      }}
      className={cx(
        'flex min-h-0 shrink-0 flex-col rounded-2xl border transition-colors duration-200',
        closed ? 'w-11' : 'min-w-[250px] flex-1 basis-0',
        over
          ? 'border-ink/30 bg-ink/[0.05]'
          : 'border-ink/[0.06] bg-ink/[0.015] light:bg-ink/[0.025]',
        'hc:border-[var(--vscode-contrastBorder)]'
      )}
    >
      <h3 className="m-0">
        <Button
          variant="ghost"
          onPress={onToggle}
          aria-expanded={!closed}
          className={cx(
            'w-full gap-2 rounded-t-2xl rounded-b-none text-[11px] font-medium tracking-[0.08em] uppercase',
            closed ? 'h-auto flex-col py-3 [writing-mode:vertical-rl]' : 'h-10 justify-start px-3'
          )}
        >
          <Dot color={statusDot(status)} />
          <span className={cx('text-soft', !closed && 'flex-1 text-left')}>{status}</span>
          <span className="text-muted tabular-nums">{items.length}</span>
          {!closed && <Icon path={mdiChevronLeft} size={14} className="text-muted" />}
          {closed && <Icon path={mdiChevronRight} size={14} className="rotate-90 text-muted" />}
        </Button>
      </h3>

      {!closed && (
        <div className="grid min-h-0 content-start gap-2 overflow-y-auto border-t border-ink/[0.06] p-2.5">
          {loading ? (
            Array.from({ length: 2 }, (_, i) => (
              <div
                key={i}
                className="h-20 animate-breathe rounded-xl bg-ink/[0.05] motion-reduce:animate-none"
              />
            ))
          ) : items.length ? (
            items.map((t) => <BoardCard key={t.key} t={t} theme={theme} statuses={statuses} />)
          ) : (
            <p className="m-0 px-1 py-3 text-center text-[12px] text-muted">Nothing here</p>
          )}
        </div>
      )}
    </section>
  );
}
