import { useState } from 'react';
import {
  Checkbox,
  Menu,
  MenuItem,
  MenuTrigger,
  Popover,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  TextArea,
  TextField,
  Label as AriaLabel,
  ListBox,
  ListBoxItem,
  Select,
  SelectValue
} from 'react-aria-components';
import {
  mdiAlertCircleOutline,
  mdiArrowLeft,
  mdiChartBar,
  mdiCheck,
  mdiChevronDown,
  mdiCheckCircleOutline,
  mdiChevronRight,
  mdiCircleOutline,
  mdiCommentTextOutline,
  mdiDotsVertical,
  mdiFileDocumentOutline,
  mdiFormatListChecks,
  mdiForumOutline,
  mdiHelpCircleOutline,
  mdiInformationOutline,
  mdiOpenInNew,
  mdiProgressClock,
  mdiRobotOutline,
  mdiSwapHorizontal,
  mdiShieldCheckOutline,
  mdiSourceBranch,
  mdiCloseCircleOutline
} from '@mdi/js';
import { Button, GroupLabel, Icon, Kbd, Section, ago, cx } from './ui';
import { sections } from './adf';
import { STAGES, accentOf, stageOf, type StageId } from './stages';
import { PALETTE, ink, panel, pill, tile, type Accent, type Theme } from './surfaces';
import { send, type Detail, type Flow } from './host';

export { STAGES, type StageId };
const stageIndex = (f: Flow | null) => (f ? STAGES.findIndex((s) => s.id === f.stage) : -1);

// ---------- Rows (as the product's connection rows: a state tile, a line, a sub line) ----------
type RowState = 'done' | 'current' | 'todo' | 'fail';
const ROW: Record<RowState, { icon: string; accent: Accent; label: string }> = {
  done: { icon: mdiCheck, accent: 'green', label: 'Done' },
  current: { icon: mdiProgressClock, accent: 'blue', label: 'In progress' },
  todo: { icon: mdiCircleOutline, accent: 'neutral', label: 'Not started' },
  fail: { icon: mdiCloseCircleOutline, accent: 'red', label: 'Failed' }
};
function Row({
  state,
  lead,
  children,
  sub,
  end,
  theme
}: {
  state?: RowState;
  lead?: string;
  children: React.ReactNode;
  sub?: React.ReactNode;
  end?: React.ReactNode;
  theme: Theme;
}) {
  const s = state ? ROW[state] : null;
  return (
    <li className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 border-t border-ink/[0.06] py-2.5 first:border-t-0 first:pt-1">
      <span
        className="grid size-7 place-items-center rounded-lg border font-mono text-[11px]"
        style={tile(s?.accent ?? 'neutral', theme)}
        role={s ? 'img' : undefined}
        aria-label={s ? `${s.label}${lead ? ' ' + lead : ''}` : undefined}
      >
        {s ? <Icon path={s.icon} size={15} /> : <span className="text-muted">{lead}</span>}
      </span>
      <span
        className={cx(
          'min-w-0 pt-0.5 leading-snug [overflow-wrap:anywhere]',
          state === 'done' ? 'text-muted' : 'text-ink/90'
        )}
      >
        {children}
      </span>
      <span className="pt-0.5">{end}</span>
      {sub && (
        <span className="col-start-2 col-end-4 flex items-center gap-1.5 text-[12px] text-muted">
          {sub}
        </span>
      )}
    </li>
  );
}
const Rows = ({ children }: { children: React.ReactNode }) => (
  <ul className="m-0 list-none p-0">{children}</ul>
);
const Pill = ({
  accent,
  theme,
  children
}: {
  accent: Accent;
  theme: Theme;
  children: React.ReactNode;
}) => (
  <span
    className="inline-flex items-center rounded-md border border-ink/15 px-1.5 py-px text-[11px] whitespace-nowrap"
    style={pill(accent, theme)}
  >
    {children}
  </span>
);
const Dot = ({ accent }: { accent: Accent }) => (
  <span
    aria-hidden="true"
    className="size-1.5 shrink-0 rounded-full"
    style={{ background: PALETTE[accent].hex }}
  />
);

// ---------- Ticket text: context, acceptance criteria and notes, kept apart ----------
// Jira ADF goes through adfHtml(), which escapes every text value; the CSP allows no inline script.
function TicketText({ d, theme }: { d: Detail; theme: Theme }) {
  const [full, setFull] = useState(false);
  const desc = d.ticket.description;
  if (desc === undefined) {
    return (
      <Section icon={mdiFileDocumentOutline} title="Ticket" accent="neutral" theme={theme}>
        <div
          className="h-16 animate-breathe rounded-lg bg-ink/[0.06]"
          aria-label="Loading description"
        />
      </Section>
    );
  }
  if (desc === null) {
    return (
      <Section
        icon={mdiFileDocumentOutline}
        title="Ticket"
        caption="No description in Jira"
        accent="neutral"
        theme={theme}
      >
        <span />
      </Section>
    );
  }
  const secs = sections(desc);
  const context = secs.filter((s) => s.kind === 'context' || s.kind === 'other');
  const long = context.reduce((n, s) => n + s.html.length, 0) > 900;
  return (
    <>
      {context.length > 0 && (
        <Section
          icon={mdiFileDocumentOutline}
          title="Ticket"
          caption="From Jira"
          accent="neutral"
          theme={theme}
        >
          <div
            className={cx(
              'prose-ticket relative',
              long &&
                !full &&
                'max-h-56 overflow-hidden [mask-image:linear-gradient(to_bottom,black_70%,transparent)]'
            )}
          >
            {context.map((s, i) => (
              <div key={i}>
                {s.title && <p className="mt-3 mb-1 font-semibold text-ink/90">{s.title}</p>}
                <div dangerouslySetInnerHTML={{ __html: s.html }} />
              </div>
            ))}
          </div>
          {long && (
            <button
              className="mt-2 w-fit cursor-pointer rounded text-[12px] font-medium text-soft underline-offset-4 hover:text-ink hover:underline focus-visible:ring-2 focus-visible:ring-ink/40"
              onClick={() => setFull(!full)}
              aria-expanded={full}
            >
              {full ? 'Show less' : 'Show full description'}
            </button>
          )}
        </Section>
      )}
      {secs
        .filter((s) => s.kind === 'acceptance')
        .map((s, i) => (
          <Section
            key={'a' + i}
            icon={mdiFormatListChecks}
            title="Acceptance criteria"
            caption="From Jira"
            accent="green"
            theme={theme}
          >
            <div className="prose-ticket" dangerouslySetInnerHTML={{ __html: s.html }} />
          </Section>
        ))}
      {secs
        .filter((s) => s.kind === 'notes')
        .map((s, i) => (
          <Section
            key={'n' + i}
            icon={mdiRobotOutline}
            title={s.title ?? 'Notes'}
            caption="A note in the Jira ticket"
            accent="violet"
            theme={theme}
          >
            <div className="prose-ticket" dangerouslySetInnerHTML={{ __html: s.html }} />
          </Section>
        ))}
    </>
  );
}

// ---------- Stage tabs ----------
function Planning({ d, act, theme }: { d: Detail; act: (id: string) => void; theme: Theme }) {
  const f = d.flow;
  const canStart =
    !f && /^(to do|in progress|open|backlog|selected for development)$/i.test(d.ticket.status);
  return (
    <>
      {canStart && (
        <Section
          icon={mdiInformationOutline}
          title="Not started"
          caption="Planning reads the ticket, asks only the questions that change the build, then writes requirements and steps for you to approve."
          accent="blue"
          theme={theme}
        >
          <div className="pt-1">
            <Button variant="primary" tone={PALETTE.blue.hex} onPress={() => act('startPlanning')}>
              Start planning
            </Button>
          </div>
        </Section>
      )}
      {f?.requirements && (
        <Section
          icon={mdiFormatListChecks}
          title="Requirements"
          caption="Each one has a check: a test or a click path"
          aside={f.requirements.length}
          accent="blue"
          theme={theme}
        >
          <Rows>
            {f.requirements.map((r) => (
              <Row
                key={r.id}
                lead={r.id}
                theme={theme}
                sub={
                  <>
                    <Dot accent="blue" />
                    {r.check}
                  </>
                }
              >
                {r.text}
              </Row>
            ))}
          </Rows>
        </Section>
      )}
      {f?.questions && (
        <Section
          icon={mdiHelpCircleOutline}
          title="Questions"
          caption="Only the ones that change what gets built"
          accent="violet"
          theme={theme}
        >
          <Rows>
            {f.questions.map((q, i) => (
              <Row
                key={i}
                state={q.a ? 'done' : undefined}
                lead="?"
                theme={theme}
                sub={
                  q.a ? (
                    q.a
                  ) : (
                    <span style={{ color: ink('violet', theme) }}>Waiting for your answer</span>
                  )
                }
              >
                {q.q}
              </Row>
            ))}
          </Rows>
        </Section>
      )}
      {f?.steps && (
        <Section
          icon={mdiChartBar}
          title="Plan"
          caption="Small steps; each names the requirements it covers"
          aside={`${f.steps.length} steps`}
          accent="blue"
          theme={theme}
        >
          <Rows>
            {f.steps.map((s) => (
              <Row
                key={s.n}
                lead={String(s.n)}
                theme={theme}
                end={
                  s.covers.length ? (
                    <span className="font-mono text-[11px] text-muted">{s.covers.join(' ')}</span>
                  ) : null
                }
              >
                {s.text}
              </Row>
            ))}
          </Rows>
        </Section>
      )}
      <TicketText d={d} theme={theme} />
    </>
  );
}
const Checks = ({ f, title, theme }: { f: Flow; title: string; theme: Theme }) =>
  f.checks?.length ? (
    <Section
      icon={mdiShieldCheckOutline}
      title={title}
      aside={`${f.checks.filter((c) => c.ok).length} of ${f.checks.length} pass`}
      accent={f.checks.some((c) => c.ok === false) ? 'red' : 'green'}
      theme={theme}
    >
      <Rows>
        {f.checks.map((c) => (
          <Row
            key={c.name}
            state={c.ok === true ? 'done' : c.ok === false ? 'fail' : 'todo'}
            theme={theme}
            end={
              <span className="text-[11px] text-muted">
                {c.note ?? (c.ok === null ? 'Waiting' : '')}
              </span>
            }
          >
            {c.name}
          </Row>
        ))}
      </Rows>
    </Section>
  ) : null;
function Development({ f, theme }: { f: Flow; theme: Theme }) {
  const done = f.steps?.filter((s) => s.state === 'done').length ?? 0;
  return (
    <>
      {f.steps && (
        <Section
          icon={mdiChartBar}
          title="Steps"
          caption="The agent builds and checks one step at a time"
          aside={`${done} of ${f.steps.length}`}
          accent="aqua"
          theme={theme}
        >
          <Rows>
            {f.steps.map((s) => (
              <Row
                key={s.n}
                state={s.state}
                theme={theme}
                end={
                  s.state === 'current' ? (
                    <Pill accent="aqua" theme={theme}>
                      Now
                    </Pill>
                  ) : null
                }
              >
                {s.text}
              </Row>
            ))}
          </Rows>
        </Section>
      )}
      <Checks f={f} title="Final gate" theme={theme} />
      {f.review && (
        <Section
          icon={mdiRobotOutline}
          title="Agent review"
          caption={f.review}
          accent="violet"
          theme={theme}
        >
          <span />
        </Section>
      )}
    </>
  );
}
function Testing({ f, act, theme }: { f: Flow; act: (id: string) => void; theme: Theme }) {
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
      <Rows>
        {f.requirements?.map((r) => (
          <Row
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
                <span aria-hidden="true" className="text-ink/25">
                  •
                </span>
                {r.check}
              </>
            }
          >
            {r.text}
          </Row>
        ))}
      </Rows>
    </Section>
  );
}
function CodeReview({ f, act, theme }: { f: Flow; act: (id: string) => void; theme: Theme }) {
  if (!f.pr) {
    return <p className="px-1 text-muted">No pull request yet.</p>;
  }
  return (
    <>
      <Section
        icon={mdiSourceBranch}
        title={`Pull request #${f.pr.number}`}
        caption="Another person reviews it on GitHub. The stage ends at the merge."
        accent={f.pr.failing ? 'red' : 'green'}
        theme={theme}
        aside={
          <Button variant="ghost" className="h-7 px-2" onPress={() => act('openPr')}>
            Open
            <Icon path={mdiOpenInNew} size={13} />
          </Button>
        }
      >
        <div className="grid grid-cols-2 gap-2 pt-1 @[560px]:grid-cols-4">
          {[
            ['State', f.pr.state ?? 'Open'],
            ['Checks', f.pr.checks],
            ['Reviews', f.pr.reviews],
            ['Comments', String(f.pr.comments)]
          ].map(([k, v]) => (
            <div key={k} className="rounded-lg border border-ink/[0.07] bg-ink/[0.025] px-2.5 py-2">
              <div className="text-[11px] text-muted">{k}</div>
              <div className="text-[13px] font-medium text-ink/90">{v}</div>
            </div>
          ))}
        </div>
      </Section>
      <Checks f={f} title="CI" theme={theme} />
    </>
  );
}
function StageBody({
  id,
  d,
  act,
  theme
}: {
  id: StageId;
  d: Detail;
  act: (id: string) => void;
  theme: Theme;
}) {
  const f = d.flow,
    si = f?.closed ? STAGES.length - 1 : stageIndex(f),
    ti = STAGES.findIndex((s) => s.id === id);
  if (id === 'planning') {
    return <Planning d={d} act={act} theme={theme} />;
  }
  if (!f || ti > si) {
    return (
      <p className="px-1 py-2 text-muted">
        {STAGES[ti].label} starts after {STAGES[ti - 1].label.toLowerCase()}.
      </p>
    );
  }
  if (id === 'development') {
    return <Development f={f} theme={theme} />;
  }
  if (id === 'testing') {
    return <Testing f={f} act={act} theme={theme} />;
  }
  return <CodeReview f={f} act={act} theme={theme} />;
}

// ---------- Side rail ----------
function Rail({ d, theme }: { d: Detail; theme: Theme }) {
  const t = d.ticket,
    f = d.flow;
  const Item = ({ k, v }: { k: string; v?: React.ReactNode }) =>
    v ? (
      <>
        <dt className="text-muted">{k}</dt>
        <dd className="m-0 [overflow-wrap:anywhere] text-soft">{v}</dd>
      </>
    ) : null;
  return (
    <div className="grid min-w-0 content-start gap-3">
      <Section icon={mdiInformationOutline} title="Details" accent="neutral" theme={theme}>
        <dl className="m-0 grid grid-cols-[78px_minmax(0,1fr)] gap-x-3 gap-y-2 pt-1 text-[12px]">
          <Item k="Jira" v={t.status} />
          <Item k="Points" v={t.points == null ? 'Not pointed' : String(t.points)} />
          <Item k="Type" v={t.type} />
          <Item k="Priority" v={t.priority} />
          <Item k="Reporter" v={t.reporter} />
          <Item k="Labels" v={t.labels?.join(', ')} />
          <Item k="Updated" v={ago(t.updated)} />
        </dl>
      </Section>
      {f && (f.branch || f.app || f.pr) && (
        <Section
          icon={mdiSourceBranch}
          title="Work"
          accent={accentOf({ kind: 'waiting', stage: f.stage })}
          theme={theme}
        >
          <dl className="m-0 grid grid-cols-[78px_minmax(0,1fr)] gap-x-3 gap-y-2 pt-1 text-[12px]">
            <Item
              k="Branch"
              v={
                f.branch && (
                  <span className="font-mono text-[11.5px]">
                    {f.branch.replace(/\//g, '/\u200b')}
                  </span>
                )
              }
            />
            <Item
              k="App"
              v={
                f.app && (
                  <span className="block truncate font-mono text-[11.5px]" title={f.app}>
                    {f.app.replace(/^https?:\/\//, '')}
                  </span>
                )
              }
            />
            <Item k="PR" v={f.pr && `#${f.pr.number}`} />
          </dl>
        </Section>
      )}
      <Section
        icon={mdiSwapHorizontal}
        title="Jira status"
        caption="Changes only after you approve, or by the agent if you allow it here"
        accent="neutral"
        theme={theme}
      >
        <Checkbox
          isSelected={!!d.jira?.agentMayMove}
          onChange={(v) => send({ type: 'setAgentMove', key: t.key, allow: v })}
          className="group flex cursor-pointer items-start gap-2.5 rounded-lg py-1.5 text-[12.5px] text-soft outline-none"
        >
          {({ isSelected, isFocusVisible }) => (
            <>
              <span
                aria-hidden="true"
                className={cx(
                  'mt-0.5 grid size-4 shrink-0 place-items-center rounded border transition-colors',
                  isSelected ? 'border-transparent' : 'border-ink/30',
                  isFocusVisible && 'ring-2 ring-ink/40'
                )}
                style={isSelected ? { background: PALETTE.blue.hex, color: '#fff' } : undefined}
              >
                {isSelected && <Icon path={mdiCheck} size={12} />}
              </span>
              <span>
                <span className="text-ink/90">Let the agent update the Jira status</span>
                <span className="block text-[11px] text-muted">
                  For routine tickets. Status only: never comments, fields or other tickets.
                </span>
              </span>
            </>
          )}
        </Checkbox>
        {d.jira && <AfterMergeSelect ticketKey={t.key} jira={d.jira} />}
        {!!d.jira?.moves.length && (
          <ul className="m-0 mt-1 grid list-none gap-1 border-t border-ink/[0.06] p-0 pt-2 text-[11.5px] text-muted">
            {d.jira.moves.map((m, i) => (
              <li key={i}>
                {m.ok ? '' : 'Failed: '}
                {m.from ? `${m.from} → ` : ''}
                {m.to} · {m.by === 'agent' ? 'by the agent' : 'by you'} · {ago(m.at)}
                {m.dryRun ? ' (dry run)' : ''}
              </li>
            ))}
          </ul>
        )}
      </Section>
      {f && (
        <p className="m-0 px-1 text-[11px] text-muted">Agent data on this page is sample data.</p>
      )}
    </div>
  );
}

// ---------- After merge ----------
const AUTO = '__auto';

function autoLabel(j: NonNullable<Detail['jira']>) {
  const a = j.afterMerge;
  if (a.source === 'rule') {
    return a.to ? `Automatic: ${a.to} (branch rule)` : 'Automatic: ask me (branch rule)';
  }
  return `Automatic: ${a.source === 'ticket' ? j.defaultAfterMerge : (a.to ?? j.defaultAfterMerge)}`;
}

function AfterMergeSelect({
  ticketKey,
  jira
}: {
  ticketKey: string;
  jira: NonNullable<Detail['jira']>;
}) {
  const own = jira.afterMerge.source === 'ticket' ? jira.afterMerge.to : null;
  const items = [
    {
      id: AUTO,
      label: autoLabel({
        ...jira,
        afterMerge: own ? { to: jira.defaultAfterMerge, source: 'default' } : jira.afterMerge
      })
    },
    ...jira.afterMergeOptions.map((s) => ({ id: s, label: s }))
  ];
  return (
    <Select
      selectedKey={own ?? AUTO}
      onSelectionChange={(k) =>
        send({ type: 'setAfterMerge', key: ticketKey, to: k === AUTO ? null : String(k) })
      }
      className="mt-1 grid gap-1 border-t border-ink/[0.06] pt-2"
    >
      <AriaLabel className="text-[11.5px] text-muted">After the merge, move to</AriaLabel>
      <Button
        variant="ghost"
        className="justify-between border border-ink/10 px-2.5 py-1.5 text-[12.5px] text-soft"
      >
        <SelectValue />
        <Icon path={mdiChevronDown} size={14} />
      </Button>
      <Popover
        offset={4}
        className="min-w-[var(--trigger-width)] rounded-xl border border-ink/10 bg-base/95 p-1 shadow-[0_16px_40px_rgb(0_0_0/0.45)] backdrop-blur-xl outline-none light:shadow-[0_8px_24px_rgb(12_29_73/0.15)]"
      >
        <ListBox items={items} className="outline-none">
          {(it) => (
            <ListBoxItem
              id={it.id}
              className="cursor-pointer rounded-lg px-2.5 py-1.5 text-[12.5px] text-soft outline-none data-[focused]:bg-ink/[0.07] data-[focused]:text-ink data-[selected]:font-medium data-[selected]:text-ink"
            >
              {it.label}
            </ListBoxItem>
          )}
        </ListBox>
      </Popover>
      <span className="text-[11px] text-muted">
        {jira.afterMerge.source === 'rule' && !jira.afterMerge.to
          ? 'A branch rule says to ask you. The agent never moves this ticket by itself.'
          : 'One click after the merge. The agent moves it only if you allow it above.'}
      </span>
    </Select>
  );
}

// ---------- Comments ----------
function Comments({
  d,
  draft,
  setDraft,
  theme
}: {
  d: Detail;
  draft: string;
  setDraft: (s: string) => void;
  theme: Theme;
}) {
  const post = (run: boolean) => {
    const text = draft.trim();
    if (!text) {
      return;
    }
    send({ type: 'comment', key: d.ticket.key, text, run });
    setDraft('');
  };
  return (
    <Section
      icon={mdiForumOutline}
      title="Comments for the agent"
      caption="Saved on this machine, never sent to Jira"
      aside={d.comments.length || undefined}
      accent="violet"
      theme={theme}
    >
      {d.comments.length > 0 && (
        <ul className="m-0 mb-2 list-none p-0">
          {d.comments.map((c) => (
            <li
              key={c.id}
              className="grid grid-cols-[28px_minmax(0,1fr)] gap-3 border-t border-ink/[0.06] py-2.5 first:border-t-0 first:pt-1"
            >
              <span
                aria-hidden="true"
                className="grid size-7 place-items-center rounded-full border text-[11px] font-semibold"
                style={tile('blue', theme)}
              >
                Y
              </span>
              <div>
                <div className="mb-0.5 text-[11px] text-muted">
                  You · {ago(c.at)}
                  {c.ran ? ' · sent to the agent' : ''}
                </div>
                <div className="[overflow-wrap:anywhere] whitespace-pre-wrap text-soft">
                  {c.text}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      <TextField
        value={draft}
        onChange={setDraft}
        className="grid gap-2 pt-1"
        aria-label="Comment for the agent"
      >
        <AriaLabel className="sr-only">Comment for the agent</AriaLabel>
        <TextArea
          id="draft"
          placeholder="The agent reads every comment at the start of its next run."
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              post(e.shiftKey);
            }
            if (e.key === 'Escape') {
              (e.target as HTMLElement).blur();
            }
          }}
          className="min-h-[76px] w-full resize-y rounded-lg border border-ink/10 bg-ink/[0.03] px-3 py-2 text-ink/90 transition-colors placeholder:text-muted focus:border-ink/30 focus:bg-ink/[0.05] light:bg-base"
        />
      </TextField>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="mr-auto text-[11px] text-muted">
          <Kbd>⌘</Kbd> <Kbd>Enter</Kbd> to comment
        </span>
        <Button onPress={() => post(false)} isDisabled={!draft.trim()}>
          Comment
        </Button>
        <Button onPress={() => post(true)} isDisabled={!draft.trim()}>
          Comment and resume agent
        </Button>
      </div>
    </Section>
  );
}

// ---------- The pane ----------
const MENU = [
  ['pause', 'Pause agent'],
  ['replan', 'Re-plan'],
  ['openPlan', 'Open plan file'],
  ['openWorktree', 'Open worktree'],
  ['openBoard', 'Open board']
] as const;

export function TicketPane({
  d,
  tab,
  setTab,
  draft,
  setDraft,
  onBack,
  theme
}: {
  d: Detail | null;
  tab: StageId | undefined;
  setTab: (t: StageId) => void;
  draft: string;
  setDraft: (s: string) => void;
  onBack?: () => void;
  theme: Theme;
}) {
  if (!d) {
    return (
      <div className="grid max-w-[1180px] gap-4 p-5" aria-busy="true" aria-label="Loading ticket">
        <div className="h-[230px] animate-breathe rounded-2xl bg-ink/[0.05]" />
        <div className="h-[200px] animate-breathe rounded-xl bg-ink/[0.04]" />
      </div>
    );
  }
  const t = d.ticket,
    f = d.flow,
    need = f?.need;
  // A finished ticket (Jira done, or its PR merged) shows every stage as done.
  const si = f?.closed ? STAGES.length : stageIndex(f);
  const stage = f?.closed ? null : si >= 0 ? STAGES[si] : null;
  const current: StageId = tab ?? stage?.id ?? (f?.closed ? 'code-review' : 'planning');
  const accent: Accent =
    need?.kind === 'problem' ? 'red' : f?.closed ? 'green' : (stage?.accent ?? 'neutral');
  const act = (id: string) => send({ type: 'action', key: t.key, id });
  return (
    <article aria-labelledby="ttl" className="mx-auto max-w-[1180px] p-5 max-[640px]:p-3">
      <Tabs selectedKey={current} onSelectionChange={(k) => setTab(k as StageId)}>
        <header
          className="mb-4 flex flex-col gap-3.5 rounded-2xl border p-4 backdrop-blur-xl transition-[border-color,background,box-shadow] duration-500 ease-soft"
          style={panel(accent, theme, !!need)}
        >
          <nav
            aria-label="Where it is"
            className="flex min-w-0 items-center gap-1 text-xs text-muted"
          >
            {onBack && (
              <Button
                variant="ghost"
                className="-ml-1 size-7 justify-center px-0"
                aria-label="Back to queue"
                onPress={onBack}
              >
                <Icon path={mdiArrowLeft} size={16} />
              </Button>
            )}
            <span id="ttl-key" className="font-medium text-soft tabular-nums">
              {t.key}
            </span>
            <Icon path={mdiChevronRight} size={14} className="text-muted" />
            <span
              style={{
                color: stage
                  ? ink(stage.accent, theme)
                  : f?.closed
                    ? ink('green', theme)
                    : undefined
              }}
            >
              {stage ? stage.label : f?.closed ? 'Finished' : 'Not started'}
            </span>
            {!d.fresh && <span className="ml-2 text-muted">Updating…</span>}
            <div className="ml-auto flex items-center gap-0.5">
              <Button variant="ghost" className="h-7 px-2" onPress={() => act('openJira')}>
                Jira
                <Icon path={mdiOpenInNew} size={13} />
              </Button>
              <Button
                variant="ghost"
                className="h-7 px-2"
                onPress={() => act('openChat')}
                isDisabled={!f?.session}
              >
                <Icon path={mdiCommentTextOutline} size={14} />
                Chat
              </Button>
              <MenuTrigger>
                <Button
                  variant="ghost"
                  className="size-7 justify-center px-0"
                  aria-label="More actions"
                >
                  <Icon path={mdiDotsVertical} size={16} />
                </Button>
                <Popover
                  placement="bottom end"
                  offset={6}
                  className="min-w-[200px] rounded-xl border border-ink/10 bg-base/95 p-1 shadow-[0_16px_40px_rgb(0_0_0/0.45)] backdrop-blur-xl outline-none light:shadow-[0_8px_24px_rgb(12_29_73/0.15)]"
                >
                  <Menu
                    className="outline-none"
                    onAction={(k) =>
                      k === 'openBoard' ? send({ type: 'openBoard' }) : act(String(k))
                    }
                  >
                    {MENU.map(([id, label]) => (
                      <MenuItem
                        key={id}
                        id={id}
                        className="cursor-pointer rounded-lg px-2.5 py-1.5 text-[12.5px] text-soft outline-none data-[focused]:bg-ink/[0.07] data-[focused]:text-ink"
                      >
                        {label}
                      </MenuItem>
                    ))}
                  </Menu>
                </Popover>
              </MenuTrigger>
            </div>
          </nav>

          <div className="flex items-start gap-3">
            <span
              className="grid size-11 shrink-0 place-items-center rounded-xl border"
              style={tile(accent, theme, 'lg')}
            >
              <Icon
                path={
                  need?.kind === 'problem'
                    ? mdiAlertCircleOutline
                    : (stage?.icon ?? mdiFileDocumentOutline)
                }
                size={22}
              />
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <h2
                id="ttl"
                tabIndex={-1}
                className="m-0 text-lg leading-snug font-semibold break-words text-ink/95 outline-none"
              >
                {t.summary}
              </h2>
              <span className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
                {[
                  t.type,
                  t.points == null ? 'Not pointed' : `${t.points} pts`,
                  t.priority && `${t.priority} priority`,
                  `${t.status} in Jira`
                ]
                  .filter(Boolean)
                  .map((x, i) => (
                    <span key={i} className="flex items-center gap-1.5">
                      {i > 0 && (
                        <span aria-hidden="true" className="text-ink/25">
                          •
                        </span>
                      )}
                      {x}
                    </span>
                  ))}
              </span>
            </span>
          </div>

          {f?.closed && (
            <p
              className="m-0 flex items-start gap-2 rounded-lg border px-3 py-2 text-[12.5px]"
              style={pill('green', theme)}
            >
              <Icon path={mdiCheckCircleOutline} size={16} className="mt-px" />
              <span>
                <span className="font-medium">Finished.</span> {f.closed.text} The board updated
                this ticket's local record to match.
              </span>
            </p>
          )}
          {need && (
            <div
              className="flex flex-wrap items-center gap-3 rounded-xl border px-3 py-2.5"
              aria-live="polite"
              style={
                need.kind === 'problem'
                  ? { borderColor: `${PALETTE.red.hex}55`, background: `${PALETTE.red.hex}14` }
                  : { borderColor: 'var(--atb-agent-ring)', background: 'var(--atb-agent-bg)' }
              }
            >
              <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-1">
                <span
                  className="inline-flex w-fit items-center gap-1.5 rounded-full border px-2 py-px text-[11px] font-medium"
                  style={
                    need.kind === 'problem'
                      ? { color: ink('red', theme), borderColor: `${PALETTE.red.hex}66` }
                      : { color: 'var(--atb-agent)', borderColor: 'var(--atb-agent-ring)' }
                  }
                >
                  <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
                  {need.kind === 'problem'
                    ? 'Problem'
                    : need.from === 'sync'
                      ? 'Out of sync with Jira'
                      : 'Agent needs you'}
                </span>
                <span className="text-[13px] text-ink/90">{need.ask}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {need.actions.map((a, i) => (
                  <Button
                    key={a.id}
                    variant={i === 0 ? 'primary' : 'default'}
                    tone={need.kind === 'problem' ? PALETTE.red.hex : PALETTE.violet.hex}
                    onPress={() =>
                      a.id === 'comment' ? document.getElementById('draft')?.focus() : act(a.id)
                    }
                  >
                    {a.label}
                    {i === 0 && <Kbd>A</Kbd>}
                  </Button>
                ))}
              </div>
            </div>
          )}

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
                    isSelected
                      ? 'bg-ink/[0.12] font-medium text-ink shadow-[inset_0_1px_0_rgb(255_255_255/0.08)] hc:bg-transparent hc:outline hc:outline-1 hc:outline-[var(--vscode-focusBorder)] light:bg-base light:shadow-[0_1px_2px_rgb(12_29_73/0.12)]'
                      : isHovered
                        ? 'text-ink/90'
                        : 'text-muted',
                    isFocusVisible && 'ring-2 ring-ink/40'
                  )
                }
              >
                {() => (
                  <>
                    {i < si ? (
                      <Icon
                        path={mdiCheckCircleOutline}
                        size={14}
                        style={{ color: ink('green', theme) }}
                      />
                    ) : i === si ? (
                      <span
                        aria-hidden="true"
                        className="size-2 rounded-full"
                        style={{
                          background: PALETTE[s.accent].hex,
                          boxShadow:
                            theme === 'dark' ? `0 0 8px ${PALETTE[s.accent].hex}` : undefined
                        }}
                      />
                    ) : (
                      <Icon path={s.icon} size={14} className="opacity-70" />
                    )}
                    {s.label}
                    <span className="sr-only">
                      {i < si ? ', done' : i === si ? ', current stage' : ''}
                    </span>
                  </>
                )}
              </Tab>
            ))}
          </TabList>
        </header>

        <div className="@container">
          <div className="grid grid-cols-1 items-start gap-4 @[880px]:grid-cols-[minmax(0,1fr)_300px]">
            <div className="grid min-w-0 gap-3">
              {STAGES.map((s) => (
                <TabPanel
                  key={s.id}
                  id={s.id}
                  className="grid gap-3 outline-none focus-visible:rounded-xl focus-visible:ring-2 focus-visible:ring-ink/30"
                >
                  <StageBody id={s.id} d={d} act={act} theme={theme} />
                </TabPanel>
              ))}
              <Comments d={d} draft={draft} setDraft={setDraft} theme={theme} />
            </div>
            <Rail d={d} theme={theme} />
          </div>
        </div>
      </Tabs>
    </article>
  );
}

export { GroupLabel, stageOf };
