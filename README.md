# Agent Ticket Board

Agent Ticket Board shows your Jira sprint as a queue, a ticket page and a board. Each ticket can have an agent session. The agent moves the ticket through four stages: Planning, Development, Testing and Code review. You approve each stage, you test the change, and then the agent opens a draft pull request.

The board has these clients:

- A VS Code extension: the sidebar queue, the ticket page and the board tab.
- A Claude Code plugin: the same queue and ticket page in a Claude Code pane.
- Guards in the Claude Code plugin. They stop a `git push` or a Jira write by the agent.
- A command line tool, `atb`. The Claude Code pane uses it, and you can use it in scripts.

All clients read the same data in `~/.agent-ticket-board`.

## Status

The team finished milestone M0 (scaffold). Milestone M1 (read-only board in both clients) is in progress. The agent service does not exist yet. The agent records are sample files. See `PLAN.md` for the design and `ROADMAP.md` for the open work.

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
