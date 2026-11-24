export const GIT_PUSH = /\bgit\b[^;&|]*\bpush\b/;
export const JIRA_WRITE =
  /\bacli\s+jira\s+workitem\s+(transition|edit|comment|assign|create|delete|link|attachment)\b/;
/** GitHub writes: pull requests, issues, reviews, releases, repos, and `gh api` with a write method. */
export const GH_WRITE =
  /\bgh\s+(?:(?:pr\s+(?:create|merge|comment|edit|close|reopen|review|ready|lock|unlock))|(?:issue\s+(?:create|comment|edit|close|reopen|delete|transfer|lock|unlock|pin|unpin))|(?:release\s+(?:create|edit|delete|upload))|(?:repo\s+(?:create|delete|edit|rename|archive|fork|sync))|(?:api\b[^;&|]*(?:-X|--method)\s*(?:POST|PUT|PATCH|DELETE)))/i;
/** A dev server, Storybook or app server started by hand: the board starts the app of a ticket itself. */
export const SERVER_START =
  /(?:\bpnpm\b[^;&|]*(?<![\w-])(?:dev|serve|start|storybook)(?![\w:-]))|(?:\b(?:npx|pnpm\s+exec)\s+vite\b(?![\w-]))/;
// Only a client may pass --approved (the developer's approval); the agent uses `atb move` without it.
export const SELF_APPROVE = /\batb(\.cjs)?\b[^;&|]*\bmove\b[^;&|]*--approved\b/;

/** The refusal for a Bash command that breaks a board rule, or null when the command may run. */
export function refusal(cmd: string): { deny: string; toast?: string } | null {
  if (SERVER_START.test(cmd)) {
    return {
      deny: 'BLOCKED by agent-ticket-board: the board runs the app of the ticket. Do not start a dev server, Storybook or a watcher. Testing gets the running app.'
    };
  }
  if (GIT_PUSH.test(cmd)) {
    return {
      toast: 'Blocked git push (needs your "approved" first)',
      deny: 'BLOCKED by agent-ticket-board: git push is not allowed until the owner approves the ticket. Do not retry; tell the owner it is ready to test.'
    };
  }
  if (GH_WRITE.test(cmd)) {
    return {
      deny: 'BLOCKED by agent-ticket-board: the agent only reads GitHub (gh pr view, gh pr diff, gh issue view, gh search). It never creates, comments on, merges or edits anything. Draft the text for the developer instead.'
    };
  }
  if (SELF_APPROVE.test(cmd)) {
    return {
      deny: 'BLOCKED by agent-ticket-board: only the developer approves a Jira move. Run `atb move <KEY> <STATUS>` without --approved; it works only if the developer allowed it for that ticket.'
    };
  }
  if (JIRA_WRITE.test(cmd)) {
    return {
      deny: 'BLOCKED by agent-ticket-board: the agent never writes to Jira directly. To change a status, run `atb move <KEY> <STATUS>` (works only where the developer allowed it). For comments or fields, draft the text for the developer.'
    };
  }
  return null;
}
