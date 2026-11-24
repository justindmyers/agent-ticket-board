export const GIT_PUSH = /\bgit\b[^;&|]*\bpush\b/;
export const JIRA_WRITE =
  /\bacli\s+jira\s+workitem\s+(transition|edit|comment|assign|create|delete|link|attachment)\b/;
// Only a client may pass --approved (the developer's approval); the agent uses `atb move` without it.
export const SELF_APPROVE = /\batb(\.cjs)?\b[^;&|]*\bmove\b[^;&|]*--approved\b/;

/** The refusal for a Bash command that breaks a board rule, or null when the command may run. */
export function refusal(cmd: string): { deny: string; toast?: string } | null {
  if (GIT_PUSH.test(cmd)) {
    return {
      toast: 'Blocked git push (needs your "approved" first)',
      deny: 'BLOCKED by agent-ticket-board: git push is not allowed until the owner approves the ticket. Do not retry; tell the owner it is ready to test.'
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
