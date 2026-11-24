# Roadmap

This file lists the work that remains. `PLAN.md` gives the design and the milestones. Update this file when you finish an item or when you find new work.

## M0: Scaffold (done)

- [x] pnpm workspace: `packages/core`, `apps/cli`, `apps/vscode` and `apps/claude-plugin`.
- [x] Prettier, ESLint, EditorConfig and TypeScript strict mode.
- [x] Unit tests (vitest) and the Claude Code plugin tests.
- [x] Leak check (deny list and gitleaks), docs lint and the pre-commit hook.
- [x] CI for pull requests, an example config, `CLAUDE.md`, `README.md` and the MIT license.
- [x] `pnpm install-local` installs the CLI, the VS Code extension and the Claude Code plugin.

## M1: Read-only board in both clients

Done:

- [x] Tracker adapter (acli), disk cache, and a refresh in the background.
- [x] Sidebar queue, ticket page and board tab in VS Code.
- [x] Claude Code pane with the same queue and ticket page.
- [x] Comments for the agent, kept on this computer.
- [x] Live pull request data from `gh`.
- [x] Sync rules: the tracker owns the status, GitHub owns the code.
- [x] Jira status change after the developer approves it, and the per-ticket permission for the agent.
- [x] Status after a merge: a default, branch rules, and a choice for each ticket.

To do:

- [x] Setup detectors for the tracker (site, project, query, statuses, points field) and the repository (remote, worktree script, branch pattern, dev command, port). `atb detect` shows the values. `atb config set` saves one value.
- [x] `/atb-setup` in the Claude Code plugin. Claude fills the gaps from the named files, and the developer accepts each value.
- [ ] Edit the lists and the branch rules with their own controls. Now each value is one line of text.
- [ ] Find the dev command in a monorepo, where each app has its own `dev` script.
- [x] Settings page in VS Code and in the Claude Code pane. It shows each value, its source and the detected value with its confidence. It has "Detect again" for each section, and nothing changes until the developer saves.
- [ ] Measure the cold start. The target is less than 1 second after the first sync.
- [ ] Look at the Claude Code pane in the Claude app and in the terminal. The tests pass, but nobody looked at the colors in the real app.
- [ ] Adopt existing work: find worktrees, branches, pull requests and sessions for a ticket. Show "Adopt" or "Ignore". Propose a stage and wait for the developer.
- [x] Bring the webview code to the coding standards: one component in each file, folders for each kind of file, fewer comments.
- [x] Make the lint rules enforce more of the standards. ESLint now runs all the React hook rules, one component in each file, jsx-a11y and Prettier, with no warnings. The hook runs `lint:fix` on staged files only.
- [ ] Bring the Claude Code pane (`apps/claude-plugin/hooks/register.ts`) to the coding standards. It is one large file, and it copies the stage colors and the stage list from the webview. Move the shared values into `packages/core`.
- [ ] Shorten the header comments that have more than 2 lines (`register.ts`, `atb.ts`, `moves.ts`, `reconcile.ts`, `install-local.ts`, `leak-check.ts`).
- [ ] Animate the enter and the exit of the popovers and the menus, with `motion-reduce:animate-none`.
- [ ] Add vitest component tests (jsdom) with an accessibility check. Now only the Playwright harness checks the UI.
- [ ] Remove the sample agent records when the service writes real records.

## M2: Service, menu bar and build

Before you build, check these items:

- [ ] A session that the Agent SDK starts can continue in the VS Code Claude Code panel.
- [ ] The guard plugin loads in a session that the Agent SDK starts.

Build:

- [ ] Service with a local API. It owns all processes and sessions.
- [ ] Menu bar app (SwiftUI). It shows the service state. "Open at Login" is on, and the user can turn it off. Stop and Quit stop all processes.
- [ ] Worktree for each ticket, from the configured script.
- [ ] Port leases for the app under test, and the test handoff link.
- [ ] Sessions in read-only mode and build mode, with slots and a queue.
- [ ] "Start planning" and the other stage actions start real work. Now they show a message only.
- [ ] "Comment and resume" sends the comment to the agent session.
- [ ] The guard refuses `git push` before approval, in every session.

## M3: Review and pull request

- [ ] Testing tab with evidence for each requirement: test results and screenshots.
- [ ] Agent review loop with a filter for false findings, and the final gate (type check, lint, tests).
- [ ] After approval: commit, push, CI and a draft pull request with screenshots.
- [ ] Code review tab with the review state from GitHub, until the merge.

## M4: Workflow settings

- [ ] Settings page for the workflow: the skill, model and checkpoint for each step.
- [ ] Choose the default skills for each step. Review each skill first.
- [ ] Pre-plan for tickets that are not started.
- [ ] Drift check: find a ticket that changed after the developer approved the plan.
- [ ] Overlap check: find two tickets that change the same files.
- [ ] Group tickets that depend on each other.

## Release

- [ ] Make the GitHub repository and do the first commit. Do this only when the owner asks.
- [ ] Do a full run of CI on GitHub.
- [ ] Publish the VS Code extension and the Claude Code plugin.

## Open questions

- The design check (impeccable) flags the glow on "needs you" items as a style cliche. The glow stays for now, only on items that need the developer. Is this correct?
