# Agent Ticket Board

Agent Ticket Board shows your Jira sprint as a queue, a ticket page and a board. Each ticket can have an agent session. The agent moves the ticket through four stages: Planning, Development, Testing and Code review. You approve the plan and the tested change. The board runs the repository checks, and you read the commit plan before the board commits.

The board has these clients:

- A VS Code extension: the sidebar queue, the ticket page and the board tab.
- A Claude Code plugin: the same queue and ticket page in a Claude Code pane.
- Guards in the Claude Code plugin. They stop a `git push` or a Jira write by the agent.
- A command line tool, `atb`. The Claude Code pane uses it, and you can use it in scripts.

All clients read the same data in `~/.agent-ticket-board`.

## Status

The board plans, builds, tests and reviews a ticket, makes atomic commits, and runs the checks before a push. The push, the draft pull request and the pull request tracking are not built yet. See `ROADMAP.md` for the open work and `PLAN.md` for the design.

## How it works

`FLOW.md` holds seven charts. Open `~/.agent-ticket-board/FLOW.html` for the same charts in a page. Each chart ends with the places where you can check it: an audit event, a field of the ticket record, or a command.

1. **The parts.** The clients, the shared core library, the board service, the store and the agent sessions.
2. **How tickets arrive.** The board reads your sprint with `acli`, the pull requests with `gh`, and the local work with git. It shows the cache first and fills in the details one by one.
3. **The stages and who decides.** Four stages, three of them with an approval from you. You can start a ticket over at any time.
4. **One agent run.** A button starts a run. The service queues it, starts a Claude agent with a command allowlist and a cost cap, and writes the result into the ticket record. A guard refuses a push and every write to GitHub or Jira.
5. **Development and Testing.** The agent builds the plan in a new worktree. Then the board runs the checks of your repository. A failure goes back to the agent. Testing opens the app and a browser for the ticket, and the agent collects evidence for each requirement.
6. **Code review.** Reviewers read the change, and the agent fixes each finding that the code shows. The board runs the checks again. An agent plans atomic commits, and you read the plan. The board makes the commits with your git hooks. The last step is the pre-push gate: the checks, a merge of the base branch, and the checks again.
7. **What the board may write.** Agents edit files in the worktree of their ticket. Only you approve a plan, a code review or a Jira move.

Each ticket has one record, `~/.agent-ticket-board/agents/KEY.json`. The audit log is `tickets/KEY/events.jsonl`. Each agent run has its own folder in `tickets/KEY/runs/`. Run `atb audit KEY` to read the log.

## Checks for your repository

The board runs the commands in `repo.checks` of `~/.agent-ticket-board/config.json`, in order. A command can use these placeholders:

- `{changed}` is the changed files, and `{tests}` is the changed test files.
- `{tests:apps/web/}` is only the test files in that folder, without the folder in the path.
- `{atb}` is the command of the board CLI. `{atb} diff-scope` keeps the findings of a check on the lines that the ticket changed.

The commands in `repo.beforeCommit` run before the commit plan. Use them for generators. `repo.baseBranch` is the branch that the board merges.

## Requirements

- Node.js 22 or later, and pnpm 10.
- The Atlassian CLI (`acli`), signed in to your Jira site.
- The GitHub CLI (`gh`), signed in.
- VS Code, Claude Code, or both.

## Set up

1. Install the packages:

   ```sh
   pnpm install
   ```

2. Copy `config.example.json` to `~/.agent-ticket-board/config.json`. Then change the values for your Jira site and your repository.
3. Build and install the clients:

   ```sh
   pnpm install-local
   ```

4. In VS Code, run "Developer: Reload Window". The board shows in the activity bar.
5. In Claude Code, open this folder and type `/board`.

## Jira writes

The board writes only one thing to Jira: the status of a ticket. It changes the status only in these two conditions:

- You approve the move in a client. For example, you drag a card to a new column, and then you click the move button in the dialog.
- You turn on "Let the agent update the Jira status" for that ticket. Use this setting for routine tickets.

The board never writes comments, fields, labels or other tickets. Each status change goes into `~/.agent-ticket-board/events.jsonl`.

## Development

| Command | What it does |
| --- | --- |
| `pnpm typecheck` | Type check for all packages. |
| `pnpm lint` | ESLint. |
| `pnpm test` | Unit tests (vitest) and the Claude Code plugin tests. |
| `pnpm test:ui` | Draws the webview with sample data in 3 themes. Then it runs axe and a keyboard test. |
| `pnpm leak-check` | Finds private words and secrets. |
| `pnpm docs:lint` | Finds text in the docs that is not Simplified Technical English. |

The coding standards are in `CLAUDE.md`.

## License

MIT. See `LICENSE`.
