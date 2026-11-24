import { writeRows } from './writes';
import type { EngineInterface, RenderElement } from 'claude-code';
import { agentRun } from './cli';
import { hex, kit, type Ctx } from './kit';
import { planStartable } from './look.gen';
import { runBox } from './run-box';
import { assumptionRows, earlierAnswers, planQuestions } from './plan-questions';
import type { Detail } from './types';

const sectionName = (kind: string, title: string | null) =>
  kind === 'context'
    ? 'Ticket'
    : kind === 'acceptance'
      ? 'Acceptance criteria'
      : (title ?? 'Notes');

const sectionColor = (kind: string) =>
  hex(kind === 'notes' ? 'violet' : kind === 'acceptance' ? 'green' : 'neutral');

export function stagePlanning($: EngineInterface, ctx: Ctx, d: Detail) {
  const { Box, Text, Button, Markdown } = ctx.els;
  const { dim, sectionTitle } = kit(ctx);
  const t = d.ticket;
  const f = d.flow;
  const body: RenderElement[] = [];
  const startable =
    planStartable(f) &&
    !d.adopt &&
    (d.tracker ? d.tracker.state !== 'done' : /^(to do|in progress)$/i.test(t.status));

  body.push(...runBox($, ctx, t.key, f, 'planning'));
  if (startable) {
    body.push(
      sectionTitle('ns', 'Not started', hex('blue')),
      dim(
        'Planning reads the ticket, asks only the questions that change the build, then writes requirements and steps for you to approve.'
      ),
      Button({
        key: 'start',
        label: 'Start planning',
        variant: 'primary',
        onPress: () => void agentRun($, t.key, 'plan')
      })
    );
  }
  body.push(
    ...planQuestions($, ctx, d),
    ...assumptionRows(ctx, d),
    ...writeRows(ctx, d.flow, 'planning'),
    ...earlierAnswers($, ctx, d)
  );
  const draft = !!f?.questions?.some((q) => !q.a);
  if (f?.requirements) {
    body.push(
      sectionTitle('req', 'Requirements', hex('blue'), String(f.requirements.length)),
      ...(draft ? [dim('Draft: it can change after your answers.')] : []),
      ...f.requirements.map((r) =>
        Box({
          key: 'r-' + r.id,
          flexDirection: 'column',
          children: [
            Text({ wrap: 'wrap', children: [r.id + '  ' + r.text] }),
            dim('    ' + r.check)
          ]
        })
      )
    );
  }
  if (f?.steps) {
    body.push(
      sectionTitle('plan', 'Plan', hex('blue'), f.steps.length + ' steps'),
      ...(draft ? [dim('Draft: it can change after your answers.')] : []),
      ...f.steps.map((s) =>
        Text({
          wrap: 'wrap',
          children: [s.n + '. ' + s.text + (s.covers.length ? '   ' + s.covers.join(' ') : '')]
        })
      )
    );
  }
  for (const [i, s] of (d.sections ?? []).entries()) {
    body.push(
      sectionTitle(
        'sec' + i,
        sectionName(s.kind, s.title),
        sectionColor(s.kind),
        s.kind === 'notes' ? 'A note in the Jira ticket' : 'From Jira'
      ),
      Markdown({ key: 'secmd' + i, text: s.md })
    );
  }
  if (d.sections === null) {
    body.push(dim('Loading the description…'));
  }
  return body;
}
