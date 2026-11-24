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
- [x] Edit the lists and the branch rules with their own controls, in VS Code and in the Claude Code pane. A list item cannot contain a comma, and a branch rule must be a valid regular expression.
- [ ] Choose "Status after the merge" from the board columns. Now it is one line of text.
- [ ] Find the dev command in a monorepo, where each app has its own `dev` script.
- [x] Settings page in VS Code and in the Claude Code pane. It shows each value, its source and the detected value with its confidence. It has "Detect again" for each section, and nothing changes until the developer saves.
- [ ] Measure the cold start. The target is less than 1 second after the first sync.
- [x] Look at the Claude Code pane in the Claude app. The colors match the VS Code view.
- [x] Adopt existing work: find worktrees and branches for a ticket. Show "Adopt" or "Ignore". Propose a stage and wait for the developer. Adopt writes the agent record only.
- [ ] Adopt at a stage that the developer selects, and find Claude sessions for a ticket.
- [x] Bring the webview code to the coding standards: one component in each file, folders for each kind of file, fewer comments.
- [x] Make the lint rules enforce more of the standards. ESLint now runs all the React hook rules, one component in each file, jsx-a11y and Prettier, with no warnings. The hook runs `lint:fix` on staged files only.
- [x] Bring the Claude Code pane to the coding standards. It has one file for each view, and it has the types of Claude Code. The stage list, the colors and the accent rule come from `packages/core/src/look.ts`. The plugin gets a generated copy, because it cannot import core. `pnpm test` fails on a type error in the plugin.
- [x] Shorten the header comments that have more than 2 lines.
- [x] Animate the enter and the exit of the popovers and the menus. Reduced motion stops the animations.
- [ ] Add vitest component tests (jsdom) with an accessibility check. Now only the Playwright harness checks the UI.
- [x] Ticket pages and colors follow the Jira state when the board has no agent work for a ticket. A "Not started statuses" setting sets which statuses mean that no work started.
- [x] The board reads local git work for each ticket: a branch with the ticket key, and the changed files in its worktree. A not-started ticket with local work shows as started.
- [ ] Remove the sample agent records when the service writes real records. Sample records now stay in the test fixtures only.

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
