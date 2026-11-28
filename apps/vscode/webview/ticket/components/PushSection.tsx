import { mdiCloudUploadOutline } from '@mdi/js';
import { dryRunText, pushLinks } from '@agent-ticket-board/core/look';
import { Pill } from '../../shared/components/Pill';
import { Section } from '../../shared/components/Section';
import type { Push } from '../../shared/types/host';
import type { Theme } from '../../shared/types/theme';
import type { Act } from '../types/ticket';
import { OpenLinkButton } from './OpenLinkButton';
import { TicketRow } from './TicketRow';
import { TicketRows } from './TicketRows';

type Props = { push: Push; act: Act; theme: Theme };

/**
 * The push of the branch: what the dry run shows before it, and the links after it. Before the push
 * GitHub has neither the branch nor the commits, so there are no links yet.
 */
export function PushSection({ push, act, theme }: Props) {
  const pushed = !!push.pushedAt;
  const links = pushLinks(push);
  const facts = [
    {
      label: 'Branch',
      value: <span className="font-mono text-[12px] [overflow-wrap:anywhere]">{push.branch}</span>
    },
    ...(pushed ? [] : [{ label: 'Dry run', value: dryRunText(push.dryRun, push.branch) }]),
    {
      label: 'Command',
      value: <code className="font-mono text-[12px] [overflow-wrap:anywhere]">{push.command}</code>
    }
  ];

  return (
    <Section
      icon={mdiCloudUploadOutline}
      title="Push"
      caption={
        pushed
          ? 'The branch is on origin.'
          : 'This is a dry run. Nothing is pushed until you approve.'
      }
      aside={
        <span className="flex items-center gap-2">
          {links && (
            <OpenLinkButton label="Open a pull request" onPress={() => act('openPush:pr')} />
          )}
          <Pill accent={pushed ? 'green' : 'rose'} theme={theme}>
            {pushed ? 'Pushed' : 'Dry run'}
          </Pill>
        </span>
      }
      accent={pushed ? 'green' : 'rose'}
      theme={theme}
    >
      <div className="grid grid-cols-1 gap-2 pt-1">
        {facts.map((x) => (
          <div
            key={x.label}
            className="rounded-lg border border-ink/[0.07] bg-ink/[0.025] px-2.5 py-2"
          >
            <div className="text-[11px] text-muted">{x.label}</div>
            <div className="text-[13px] text-ink/90">{x.value}</div>
          </div>
        ))}
      </div>
      <TicketRows>
        {push.commits.map((c) => (
          <TicketRow
            key={c.sha || c.short}
            state={pushed ? 'done' : 'todo'}
            theme={theme}
            end={
              links && c.sha ? (
                <OpenLinkButton label={c.short} onPress={() => act(`openPush:commit:${c.sha}`)} />
              ) : (
                <span className="font-mono text-[11px] text-muted">{c.short}</span>
              )
            }
          >
            <span className="font-mono text-[12px]">{c.title}</span>
          </TicketRow>
        ))}
      </TicketRows>
      {links && (
        <div className="pt-1">
          <OpenLinkButton label="Open the branch" onPress={() => act('openPush:branch')} />
        </div>
      )}
    </Section>
  );
}
