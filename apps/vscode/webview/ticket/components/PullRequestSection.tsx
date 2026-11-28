import { actionHelp } from '@agent-ticket-board/core/look';
import { mdiOpenInNew, mdiSourcePull } from '@mdi/js';
import { Button } from '../../shared/components/Button';
import { Icon } from '../../shared/components/Icon';
import { Pill } from '../../shared/components/Pill';
import { Section } from '../../shared/components/Section';
import type { Flow, PrPlan } from '../../shared/types/host';
import type { Theme } from '../../shared/types/theme';
import type { Act } from '../types/ticket';
import { Fact } from './Fact';
import { OpenLinkButton } from './OpenLinkButton';
import { PullRequestFacts } from './PullRequestFacts';

type Props = { plan: PrPlan; live?: Flow['pr']; act: Act; theme: Theme };

/**
 * The draft pull request: what the board will make, shown before it is made, and the address after.
 * The title, the body and the screenshots are the ones that GitHub gets.
 * Once GitHub has the pull request, `live` is its state, and this is the one card for it.
 */
export function PullRequestSection({ plan, live, act, theme }: Props) {
  const made = !!plan.createdAt && !plan.update;
  const updating = !!plan.update;
  const accent = updating ? 'rose' : live?.failing ? 'red' : made || live ? 'green' : 'rose';
  const n = plan.attach.length;
  const facts = [
    {
      label: 'Title',
      value: <span className="font-mono text-[12px] [overflow-wrap:anywhere]">{plan.title}</span>
    },
    {
      label: 'Branches',
      value: (
        <span className="font-mono text-[12px] [overflow-wrap:anywhere]">
          {plan.head} into {plan.base}
        </span>
      )
    },
    {
      label: 'Includes',
      value: `${plan.commits} ${plan.commits === 1 ? 'commit' : 'commits'}, ${n} ${n === 1 ? 'screenshot' : 'screenshots'}`
    }
  ];

  const [title, ...meta] = facts;

  return (
    <Section
      icon={mdiSourcePull}
      title={live ? `Pull request #${live.number}` : 'Draft pull request'}
      caption={
        updating
          ? 'This replaces the title and the body of the pull request on GitHub. Nothing changes until you approve.'
          : live
            ? 'Another person reviews it on GitHub. The stage ends at the merge.'
            : made
              ? plan.updatedAt
                ? 'The pull request is updated. It stays a draft until you mark it ready.'
                : 'The draft is open on GitHub. It stays a draft until you mark it ready.'
              : 'This is what GitHub will get. Nothing is made until you approve. It will be a draft.'
      }
      aside={
        <span className="flex items-center gap-2">
          {live ? (
            <Button
              variant="ghost"
              className="h-7 px-2"
              onPress={() => act('openPr')}
              help={actionHelp('openPr')}
            >
              View on GitHub
              <Icon path={mdiOpenInNew} size={13} />
            </Button>
          ) : (
            made &&
            plan.url && (
              <OpenLinkButton
                label="View the pull request"
                help={actionHelp('openPlannedPr')}
                onPress={() => act('openPlannedPr')}
              />
            )
          )}
          <Pill accent={accent} theme={theme}>
            {updating
              ? 'Update preview'
              : live
                ? (live.state ?? 'Open')
                : made
                  ? plan.updatedAt
                    ? 'Updated'
                    : 'Draft open'
                  : 'Preview'}
          </Pill>
        </span>
      }
      accent={accent}
      theme={theme}
    >
      {plan.warning && (
        <p className="m-0 px-1 text-[12px] whitespace-pre-wrap text-amber-600 dark:text-amber-400">
          {plan.warning}
        </p>
      )}
      {live && <PullRequestFacts pr={live} />}
      <details open={updating || !live} className="group pt-1">
        {live && (
          <summary className="cursor-pointer rounded px-1 py-1 text-[12px] text-muted outline-none focus-visible:ring-2 focus-visible:ring-ink/40">
            Title and body
          </summary>
        )}
        <div className="grid grid-cols-1 gap-2 pt-1">
          {/* What GitHub gets comes first: the title and the body. The branches and the counts follow. */}
          {title && <Fact label={title.label}>{title.value}</Fact>}
          <Fact label="Body">
            <textarea
              readOnly
              value={plan.body}
              aria-label="The body of the pull request"
              rows={Math.min(20, Math.max(4, plan.body.split('\n').length + 1))}
              className="mt-1 block w-full resize-none rounded border-0 bg-transparent p-0 font-mono text-[11.5px] leading-[1.5] text-ink/90 outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
            />
          </Fact>
          {meta.map((x) => (
            <Fact key={x.label} label={x.label}>
              {x.value}
            </Fact>
          ))}
        </div>
      </details>
    </Section>
  );
}
