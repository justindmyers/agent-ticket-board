import { mdiInformationOutline, mdiSourceBranch } from '@mdi/js';
import { Section } from '../../shared/components/Section';
import type { Detail } from '../../shared/types/host';
import type { Theme } from '../../shared/types/theme';
import { ago } from '../../shared/utils/ago';
import { accentOf } from '../../shared/utils/stages';
import { pointsText } from '../utils/ticket';
import { JiraStatusSection } from './JiraStatusSection';
import { RailItem } from './RailItem';
import { RailList } from './RailList';

type Props = { d: Detail; theme: Theme };

export function TicketRail({ d, theme }: Props) {
  const t = d.ticket;
  const f = d.flow;

  return (
    <div className="grid min-w-0 content-start gap-3">
      <Section icon={mdiInformationOutline} title="Details" accent="neutral" theme={theme}>
        <RailList>
          <RailItem k="Jira" v={t.status} />
          <RailItem k="Points" v={pointsText(t.points, '')} />
          <RailItem k="Type" v={t.type} />
          <RailItem k="Priority" v={t.priority} />
          <RailItem k="Reporter" v={t.reporter} />
          <RailItem k="Labels" v={t.labels?.join(', ')} />
          <RailItem k="Updated" v={ago(t.updated)} />
        </RailList>
      </Section>

      {f && (f.branch || f.app || f.pr) && (
        <Section
          icon={mdiSourceBranch}
          title="Work"
          accent={accentOf({ kind: 'waiting', stage: f.stage })}
          theme={theme}
        >
          <RailList>
            <RailItem
              k="Branch"
              v={
                f.branch && (
                  <span className="font-mono text-[11.5px]">
                    {f.branch.replace(/\//g, '/\u200b')}
                  </span>
                )
              }
            />
            <RailItem
              k="App"
              v={
                f.app && (
                  <span className="block truncate font-mono text-[11.5px]" title={f.app}>
                    {f.app.replace(/^https?:\/\//, '')}
                  </span>
                )
              }
            />
            <RailItem k="PR" v={f.pr && `#${f.pr.number}`} />
          </RailList>
        </Section>
      )}

      <JiraStatusSection d={d} theme={theme} />
      {f && (
        <p className="m-0 px-1 text-[11px] text-muted">Agent data on this page is sample data.</p>
      )}
    </div>
  );
}
