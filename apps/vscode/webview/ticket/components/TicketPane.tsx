import { TabPanel, Tabs } from 'react-aria-components';
import type { Detail } from '../../shared/types/host';
import type { StageId } from '../../shared/types/stage';
import type { Accent, Theme } from '../../shared/types/theme';
import { accentOf, stageIndex, STAGES } from '../../shared/utils/stages';
import { panel } from '../../shared/utils/surfaces';
import { send } from '../../shared/utils/vscodeApi';
import { CommentsSection } from './CommentsSection';
import { FinishedNotice } from './FinishedNotice';
import { NeedBanner } from './NeedBanner';
import { StageBody } from './StageBody';
import { StageTabList } from './StageTabList';
import { TicketNav } from './TicketNav';
import { TicketRail } from './TicketRail';
import { TicketSkeleton } from './TicketSkeleton';
import { TicketTitle } from './TicketTitle';
import { Collapse } from '../../shared/components/Collapse';
import { AdoptNotice } from './AdoptNotice';
import { TrackerNotice } from './TrackerNotice';

type Props = {
  d: Detail | null;
  tab: StageId | undefined;
  setTab: (t: StageId) => void;
  draft: string;
  setDraft: (s: string) => void;
  onBack?: () => void;
  theme: Theme;
};

export function TicketPane({ d, tab, setTab, draft, setDraft, onBack, theme }: Props) {
  if (!d) {
    return <TicketSkeleton />;
  }
  const f = d.flow;
  const need = f?.need;
  // A finished ticket (Jira done, or its PR merged) shows every stage as done.
  const si = f?.closed ? STAGES.length : stageIndex(f);
  const stage = f?.closed ? null : si >= 0 ? STAGES[si] : null;
  const current: StageId = tab ?? stage?.id ?? (f?.closed ? 'code-review' : 'planning');
  const accent: Accent =
    need?.kind === 'problem'
      ? 'red'
      : f?.closed
        ? 'green'
        : (stage?.accent ?? (f ? 'neutral' : accentOf(null, d.tracker?.state)));
  const act = (id: string) => send({ type: 'action', key: d.ticket.key, id });

  return (
    <article aria-labelledby="ttl" className="mx-auto max-w-[1180px] p-5 max-[640px]:p-3">
      <Tabs selectedKey={current} onSelectionChange={(k) => setTab(k as StageId)}>
        <header
          className="mb-4 flex flex-col gap-3.5 rounded-2xl border p-4 backdrop-blur-xl transition-[border-color,background,box-shadow] duration-500 ease-soft"
          style={panel(accent, theme, !!need)}
        >
          <TicketNav d={d} stage={stage} act={act} onBack={onBack} theme={theme} />

          <TicketTitle d={d} accent={accent} stageIcon={stage?.icon} theme={theme} />

          <Collapse isOpen={!!f?.closed}>
            {f?.closed && <FinishedNotice text={f.closed.text} theme={theme} />}
          </Collapse>
          <Collapse isOpen={!f && !!d.tracker?.notice && !d.adopt}>
            {d.tracker && <TrackerNotice tracker={d.tracker} theme={theme} />}
          </Collapse>
          <Collapse isOpen={!f && !!d.adopt}>
            {d.adopt && <AdoptNotice ticketKey={d.ticket.key} offer={d.adopt} theme={theme} />}
          </Collapse>
          <Collapse isOpen={!!need}>
            {need && <NeedBanner need={need} act={act} theme={theme} />}
          </Collapse>

          <StageTabList current={si} theme={theme} />
        </header>

        <div className="@container">
          <div className="grid grid-cols-1 items-start gap-4 @[880px]:grid-cols-[minmax(0,1fr)_300px]">
            <div className="grid min-w-0 gap-3">
              {STAGES.map((s) => (
                <TabPanel
                  key={s.id}
                  id={s.id}
                  className="grid animate-fade-in gap-3 outline-none focus-visible:rounded-xl focus-visible:ring-2 focus-visible:ring-ink/30"
                >
                  <StageBody id={s.id} d={d} act={act} theme={theme} />
                </TabPanel>
              ))}
              <CommentsSection d={d} draft={draft} setDraft={setDraft} theme={theme} />
            </div>

            <TicketRail d={d} theme={theme} />
          </div>
        </div>
      </Tabs>
    </article>
  );
}
