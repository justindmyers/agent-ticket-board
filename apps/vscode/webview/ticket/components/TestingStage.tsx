import { mdiFormatListChecks, mdiOpenInNew } from '@mdi/js';
import { Bullet } from '../../shared/components/Bullet';
import { Button } from '../../shared/components/Button';
import { Icon } from '../../shared/components/Icon';
import { Pill } from '../../shared/components/Pill';
import { Section } from '../../shared/components/Section';
import type { Flow } from '../../shared/types/host';
import type { Theme } from '../../shared/types/theme';
import type { Act } from '../types/ticket';
import { TicketRow } from './TicketRow';
import { TicketRows } from './TicketRows';

type Props = { f: Flow; act: Act; theme: Theme };

export function TestingStage({ f, act, theme }: Props) {
  const met = f.requirements?.filter((r) => r.met).length ?? 0;

  return (
    <Section
      icon={mdiFormatListChecks}
      title="Test checklist"
      caption="What to try, with the agent's evidence for each"
      aside={`${met} of ${f.requirements?.length ?? 0}`}
      accent="amber"
      theme={theme}
    >
      {f.app && (
        <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-ink/[0.07] bg-ink/[0.03] px-3 py-2">
          <span className="text-[11px] tracking-[0.08em] text-muted uppercase">App</span>
          <span className="min-w-0 flex-1 font-mono text-[12px] [overflow-wrap:anywhere] text-soft">
            {f.app}
          </span>
          <Button onPress={() => act('openApp')}>
            <Icon path={mdiOpenInNew} size={14} />
            Open
          </Button>
        </div>
      )}

      <TicketRows>
        {f.requirements?.map((r) => (
          <TicketRow
            key={r.id}
            state={r.met ? 'done' : 'todo'}
            lead={r.id}
            theme={theme}
            end={
              r.evidence ? (
                <Pill accent="green" theme={theme}>
                  {r.evidence.label}
                </Pill>
              ) : (
                <span className="text-[11px] text-muted">No evidence</span>
              )
            }
            sub={
              <>
                <span className="font-mono">{r.id}</span>
                <Bullet />
                {r.check}
              </>
            }
          >
            {r.text}
          </TicketRow>
        ))}
      </TicketRows>
    </Section>
  );
}
