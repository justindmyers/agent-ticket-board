import { expect, test } from 'claude-code/testing';
import { refusal } from '../hooks/guards';

// The guard hook refuses these Bash commands in every agent session, whatever the allowlist says.

const refused = (cmd: string) => refusal(cmd) !== null;

test('guards: git push and Jira writes are refused', async () => {
  expect(refused('git push origin HEAD')).toBe(true);
  expect(refused('acli jira workitem transition --key PROJ-1 --status Done')).toBe(true);
  expect(refused('atb move PROJ-1 Done --approved')).toBe(true);
});

test('guards: GitHub writes are refused', async () => {
  for (const cmd of [
    'gh pr create --fill',
    'gh pr merge 12 --squash',
    'gh pr comment 12 --body hi',
    'gh pr review 12 --approve',
    'gh issue create --title x',
    'gh issue comment 3 -b hi',
    'gh release create v1',
    'gh repo delete example/app --yes',
    'gh api repos/example/app/issues -X POST -f title=x',
    'gh api --method DELETE repos/example/app/git/refs/heads/x'
  ]) {
    expect({ cmd, refused: refused(cmd) }).toEqual({ cmd, refused: true });
  }
});

test('guards: GitHub and Jira reads pass', async () => {
  for (const cmd of [
    'gh pr view 1701 --repo example/service',
    'gh pr diff 1701 --repo example/service',
    'gh pr list --search PROJ-7',
    'gh pr checks 12',
    'gh issue view 3',
    'gh search prs PROJ-7 --owner example',
    'gh api repos/example/app/pulls/12',
    'acli jira workitem view PROJ-7 --json',
    'acli jira workitem search --jql "key = PROJ-7"',
    'git log --oneline -5'
  ]) {
    expect({ cmd, refused: refused(cmd) }).toEqual({ cmd, refused: false });
  }
});
