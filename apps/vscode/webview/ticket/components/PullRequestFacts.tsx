import type { Flow } from '../../shared/types/host';

/** The state of a pull request on GitHub: state, checks, reviews and comments. */
export function PullRequestFacts({ pr }: { pr: NonNullable<Flow['pr']> }) {
  const facts = [
    ['State', pr.state ?? 'Open'],
    ['Checks', pr.checks],
    ['Reviews', pr.reviews],
    ['Comments', String(pr.comments)]
  ] as const;
  return (
    <div className="grid grid-cols-2 gap-2 pt-1 @[560px]:grid-cols-4">
      {facts.map(([k, v]) => (
        <div key={k} className="rounded-lg border border-ink/[0.07] bg-ink/[0.025] px-2.5 py-2">
          <div className="text-[11px] text-muted">{k}</div>
          <div className="text-[13px] font-medium text-ink/90">{v}</div>
        </div>
      ))}
    </div>
  );
}
