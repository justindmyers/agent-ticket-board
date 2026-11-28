# Agent Ticket Board: plan

Status: planning. This file is the spec. Milestones are at the end.

## 1. Goal

A developer works on tracker tickets with a coding agent. Agent Ticket Board does these things:

- It shows the developer's sprint tickets on a board.
- It runs one agent session for each ticket.
- It moves each ticket through five stages: Planning, Development, Testing, Code review and Ship.
- It stops for the developer at each checkpoint.

The developer works in VS Code or in Claude Code (the desktop app or the terminal). Both clients show the same data and offer the same actions.

## 2. Rules

These rules apply to every part of Agent Ticket Board.

1. **No hidden automation.** Agent work starts only when the developer clicks a button or types a command. Nothing retries, respawns or promotes work by itself.
2. **The tracker is the source of truth for status.** Board columns are tracker statuses. The only tracker write is a status change, for one ticket at a time. It occurs only in these conditions:
   - The developer approves the move in a client, for example with a drag and the move dialog.
   - The agent moves a ticket where the developer turned on "Let the agent update the Jira status". This setting is for routine tickets.

   The board never writes comments, fields or labels. Each move goes into `events.jsonl`. The local agent record yields to the tracker and to GitHub: a merged pull request or a finished tracker status closes the local work.
3. **No push and no pull request before approval.** The agent stops before `git push` and before it opens a pull request. The developer tests the change and approves it. A guard enforces this rule in code.
4. **The developer sees every background process.** A menu bar icon shows the service state. Stop and Quit kill every process that the service started. No process stays orphaned.
5. **Parity.** Every feature ships in the VS Code extension and in the Claude Code plugin.
6. **Fast first paint.** Each view draws from a local cache at once and refreshes in the background.
7. **Public repository.** The repository contains no organization data and no personal data. Section 11 gives the details.
8. **Configurable.** Organization settings, workflow steps and skills are user configuration. The setup assistant finds most values (section 10).
9. **Tested code.** All logic is TypeScript with unit tests. Shell scripts are not used for logic.

## 3. Architecture

```
            ┌────────────────────┐
            │  Menu bar app      │  start/stop, status, notifications
            │  (SwiftUI)         │
            └─────────┬──────────┘
                      │ child process
            ┌─────────▼──────────┐
            │  Service (Node)    │  tracker sync, store, agent sessions,
            │                    │  processes, ports, guards
            └──┬──────────┬──────┘
   localhost   │          │   localhost
   + token     │          │   + token
┌──────────────▼───┐  ┌───▼──────────────────────┐
│ VS Code extension│  │ Claude Code plugin        │
│ board, sidebar,  │  │ pane (desktop, terminal), │
│ ticket page      │  │ skills, guard hooks       │
└──────────────────┘  └───────────────────────────┘
            ▲                    ▲
            └──── shared core ───┘   (packages/core: types, tracker
                                      adapter, cache, lanes, comments)
```

- **Service.** One Node process. It owns all state and all child processes. It listens on localhost only, and each request must send a token.
- **Menu bar app.** It starts the service as a child process. It shows the state, a list of the running processes and the tickets that wait for the developer. It sends macOS notifications. Quit stops the service.
- **VS Code extension.** It has an activity bar view (the consolidated ticket list), a board tab and one tab for each ticket page. It talks to the service.
- **Claude Code plugin.** It has a pane in the desktop app and in the terminal, the workflow skills and the guard hooks. The pane does not open in the VS Code chat panel, because the extension covers VS Code.
- **CLI (`atb`).** It is a thin client of the service for scripts and for the plugin.
- **Shared core.** Both clients use the same types and the same lane logic. Thus they group tickets the same way.

Until the service exists (milestone M2), the clients read the shared core directly. Shared files are in `~/.agent-ticket-board/`.

## 4. Data

| Record | Owner | Contents |
|---|---|---|
| Ticket | Tracker (read-only cache) | key, summary, status, type, priority, labels, points, description, tracker comments |
| Flow | Service | stage, waiting reason, requirements with checks, questions, plan steps, worktree, branch, port, session id, pull request, usage |
| Comment | Service | ticket key, author (developer or agent), text, time, "sent to agent" flag |
| Process | Service | pid, start-time fingerprint, ticket, kind (dev server, browser, agent) |
| Config | User file | section 9 |

The clients show tracker comments read-only. Board comments never go to the tracker. The agent reads all board comments at the start of each run.

## 5. Workflow

Each stage is a row in the workflow config. A row names the skills, the helper agents, the model, the effort and whether the step stops for the developer. The developer can change any row without a code change.

| Stage | What happens | Stops for the developer |
|---|---|---|
| Planning | The agent reads the ticket and the code. It looks up linked tickets and pull requests with read-only commands. It writes numbered requirements. Each requirement gets a check: a test or a click path. The agent asks at most 3 questions, and only questions that block the build. It decides the rest and lists each decision as an assumption. After the developer answers, the next plan is final: it cannot ask more questions. Then it writes small steps, and each step names the requirements that it covers. | Yes: "Approve plan and start" |
| Development | The steps are code changes and commands only. Browser, device and manual checks go to Testing. Worker agents do one step each and run the targeted check for that step. Then reviewer agents check the diff (correctness, reuse, style, UI), and a verifier removes false findings. The review runs 3 rounds at most. One final gate follows: type check, then lint and tests for the changed files. | No |
| Testing | The service starts the app of the worktree on a free build port, and opens a browser for the ticket. The developer logs in once. The agent checks each requirement in the live app or with its test. It views every screenshot, fixes what looks wrong and takes the shots again. The Testing tab shows each requirement with its evidence. Storybook is only for a new shared component or a large new component. | Yes: "Approve for code review" |
| Code review | The approval starts one review round. Reviewers report only: correctness, code style and the reviewers of the repository. A checker reads the source and drops each finding that it cannot find in the code. The agent fixes the others, except style notes, and runs the repository tests again. The developer can choose to fix or dismiss any finding. Then the board runs the checks of the repository config. | Waits for the developer |
| Ship | The button "Plan the commits" starts it. An agent plans atomic commits by topic, and the board makes them after the developer reads the plan. "Prepare the push" merges the base branch and runs the checks again when the merge brings changes. "Preview the push" is a dry run. After approval: push, CI, then a draft pull request with screenshots. Another person reviews the pull request on the git host. The tab shows the pull request, its checks and its review comments. The stage ends when the pull request merges. | Waits for the reviewer |

**Fast path.** A clear ticket has acceptance criteria and no open questions. For a clear ticket, the agent shows the requirements and the plan in one message and stops once.

**After the merge.** The workflow ends at the merge. After the merge, the ticket follows its tracker status only.

**Other behavior:**

- **Pre-plan.** The service keeps a configurable number of tickets planned ahead of time, with no worktree.
- **Drift check.** The service stores a hash of the ticket at planning time. If the ticket changes later, the ticket page shows the change and offers "Re-plan".
- **Overlap check.** If two active tickets change the same files, the plan step asks how they land: stack, keep independent, or fold into one.
- **Grouping.** Several small tickets of the same kind (for example, dependency updates) can go into one pull request. The plan lists the grouped tickets.

**Default skills** (vendored at a pinned version, so they never update by themselves):

- The workflow skills that this repository writes.
- `tdd`, `diagnosing-bugs` (bug tickets), `code-review`, `handoff` and `research` from mattpocock/skills.
- `implement` and `pr` from the same set, in an edited form. Our version of `implement` does not commit. Our version of `pr` supplies only the body template. Titles and commits follow the target repository's own conventions.

## 6. Agent runtime

- **Engine.** The Claude Agent SDK runs the agent with the developer's own Claude Code sign-in. The board never reads or stores credentials.
- **One session for each ticket.** The session starts when the ticket appears. Before Start, the session is read-only: the agent can discuss, read code, check readiness and draft points. Start switches the same session to build mode.
- **Settings in agent sessions.** Agent sessions load only the settings of the target repository (`settingSources: ['project', 'local']`, `strictMcpConfig: true`). They do not load the developer's own CLAUDE.md, MCP servers or plugins. The board adds its guard plugin.
- **Continue in chat.** The Claude Code panel does not show sessions that the Agent SDK starts. Thus the board hands off a summary, not the session:
  1. The board writes a handoff file in `~/.agent-ticket-board/tickets/<KEY>/`. It has the ticket, the stage, the result so far, the open questions and the path of the agent transcript.
  2. The board opens a new Claude Code chat with a prompt that tells the chat to read the handoff file. The board types the prompt in. The developer sends it. In VS Code, the chat opens in a window on the worktree. In the Claude app and the terminal, the pane puts the prompt in the prompt box.
  3. The developer iterates in the chat with the normal setup.
  4. The chat runs `atb handback <KEY> "<summary>"`. The ticket then shows "Changed in chat" and offers the next step of its stage, for example Test again. With `--replan`, the ticket goes back to Planning for the change.
- **Exact session.** "Continue in terminal" runs `claude --resume <id>` in the worktree, with the same settings as the agent.
- **Outside work.** If the worktree changes outside the board, the ticket page shows the changed files and the new commits. The developer can use them and continue. The next agent run starts a new session from the handback and the current diff. A Testing result or a review that came before the outside work says so, and offers to run again.
- **Guards.** A plugin hook refuses these commands and tells the agent why:
  - `git push` and `gh pr create`, until the ticket has the developer's approval.
  - Any tracker write.
  - Any other command on the configured deny list.
- **Models.** Read-only mode uses a mid-tier model. Build mode uses the top model. The developer can override the model for each ticket.
- **Limits.** Each run has a cap on turns or cost. At the cap, the agent stops at a safe point, writes a handoff note in the comment thread and waits.
- **Parallel builds.** The cap is configurable (default 3). Extra Start clicks go into a queue. A heavy-job lock lets only one install, type check or build run at a time.

### Audit log

Each ticket keeps a full record of what happened, so that the developer can audit a failure. The record is in `~/.agent-ticket-board/tickets/<KEY>/`.

- **Timeline.** `events.jsonl` has one line for each event, with the time and the source. Events include:
  - Runs: queued, started, stopped, finished and failed, with the error and its stack.
  - Record changes: the fields before and after.
  - Developer actions: answers, approvals, moves, adopt, comments and handbacks.
  - Service decisions: slots, the queue, cost caps and process kills.
- **Runs.** Each run has its own folder, `runs/<run id>/`, with:
  - The prompt and the session options (no secrets).
  - Every SDK message, in order (`messages.jsonl`).
  - The raw structured output, before validation.
  - The error output of the agent process, the cost, the tokens and the session id.
- **Tracker calls.** Each tracker and git host call that the service makes, with the command and the exit code.
- **Tools.** `atb audit <KEY>` shows the timeline. "Copy debug bundle" makes one archive of the folder, with tokens removed.
- **Privacy.** The log has ticket text and code. It stays on this computer. The board never sends or commits it.
- **Retention.** The board keeps the log until the ticket is finished and a configured time passes. A size cap removes the oldest runs first.

## 7. Processes and ports

- The service starts every child in its own process group and records it.
- Stop, Quit and Restart kill all recorded groups and then check that the processes are gone.
- At start, the service kills the processes that a crashed run left.
- The service exits if the menu bar app dies. The menu bar app kills the service group if the service dies.
- Each build leases one port from a configured range. Port 3000 (configurable) belongs to the developer unless the developer clicks "Serve on 3000".
- A dev server stops when its ticket leaves "ready to test" or after an idle limit. Each browser closes after its screenshot step.

## 8. User interface

- **Theme.** The UI follows the light or dark theme of VS Code. The default theme uses semantic token names only (for example `surface`, `surface-card`, `card-border`, `card-ring`, `accent`). No token name refers to a company or a product.
- **Design process.** The `impeccable` skill shapes each view before the build, then audits, critiques and polishes it.
- **Accessibility tests.** Automated axe checks run on every view in the light, dark and high-contrast themes. Each view passes a keyboard-only walkthrough. Text contrast is 4.5:1 or more. Motion respects reduced-motion settings.
- **Sidebar list.** Lanes: Waiting on you, Running, Planned, Pull request open, then the tracker statuses. The Done lane starts collapsed. A click opens the ticket page.
- **Board.** One column for each tracker status. Each card shows key, summary, points and agent state. A drag runs the tracker transition after a confirmation.
- **Ticket page.** It opens in its own tab and has these parts:
  - A header with status, points, lane, the main action for the current stage and an overflow menu (Pause, Re-plan, Open plan file).
  - One tab for each stage. The tab of the current stage opens by default. The header and the comment thread show on every tab.
  - Planning tab: requirements with their checks, the questions and the plan. Testing tab: the requirements as a checklist with evidence. Code review tab: the findings and the board checks. Ship tab: the commits, the push, the pull request, its checks and review comments.
  - The comment thread with a composer: "Comment" and "Comment and run".
  - A side rail with ticket facts, worktree, branch, app link and usage.
- **Claude Code pane.** It has the same lanes and the same ticket view (stages, requirements, plan, comments, comment input).
- **Loading.** Each view draws from the disk cache at once. A small "updating" chip shows the refresh progress. Skeleton placeholders appear only on the first run.
- **Settings page.** It shows every config section and the source of each value. It has "Set up with Claude" and "Detect again" buttons.

## 9. Configuration

The config file is `~/.agent-ticket-board/config.json`. It is not in the repository. The repository ships only this example:

```json
{
  "tracker": {
    "kind": "jira-acli",
    "site": "example.atlassian.net",
    "project": "PROJ",
    "jql": "project = PROJ AND assignee = currentUser() AND sprint in openSprints()",
    "pointsField": "customfield_00000",
    "columns": ["To Do", "In Progress", "Code Review", "Done"],
    "finished": ["Done"],
    "afterMerge": "Done",
    "afterMergeRules": [{ "branch": "^hotfix/", "to": null }]
  },
  "repo": {
    "path": "~/code/example-app",
    "worktreeScript": "./scripts/new-worktree.sh",
    "branch": "{type}/{key}-{slug}",
    "prTitle": "{type}({scope}): {description} ({key})"
  },
  "app": { "devCommand": "pnpm dev --port {port} --strictPort", "ownerPort": 3000, "buildPorts": [3001, 3005] },
  "agents": { "parallel": 3, "readOnlyModel": "sonnet", "buildModel": "opus", "turnCap": 150 },
  "guards": { "denyUntilApproved": ["git push", "gh pr create"], "denyAlways": ["tracker-write"] },
  "workflow": "workflow.json"
}
```

## 10. Setup with Claude

The developer does not type the config. "Set up with Claude" (in the settings page or with `/atb-setup`) does these steps:

1. **Detect.** Tested detector functions use the tools that the developer signed in to:
   - Tracker: `acli jira auth status` (site), `acli jira project list --json`, board and sprint search, the assigned open-sprint tickets (project and statuses), and one ticket with points (points field).
   - Git host: `gh auth status` and the git remotes.
   - Repository: worktree scripts and the branch names in `git branch -r`.
   - Pull request conventions: `.github/`, `CONTRIBUTING` and `.claude/skills`.
   - App: the dev command and the port in `package.json` and the bundler config.
2. **Fill the gaps.** Claude reads only the values that a detector cannot read, for example the pull request conventions in prose.
3. **Review.** The settings page shows each value, its source and a confidence level. Nothing goes to disk until the developer clicks "Save".
4. **Re-run.** "Detect again" runs one section again.

## 11. Public repository rules

- The repository contains no employer names, domains, project keys, field ids, repository paths, ticket data, personal names or email addresses. This rule applies to code, tests, fixtures, docs, screenshots and commit messages.
- Fixtures use invented data (`example.atlassian.net`, `PROJ-123`).
- A leak check runs before each commit and each push: gitleaks, plus a deny list of words. The deny list stays outside the repository.
- Contributors copy no code or prompt text from private sources. Ideas from other workflows are rewritten in generic words.

## 12. Repository layout

```
packages/core            types, tracker adapter, cache, lanes, comments, config, detectors
apps/service             Node service (localhost API, sessions, processes, guards)
apps/menubar             SwiftUI menu bar app
apps/vscode              VS Code extension (webviews)
apps/claude-plugin       Claude Code plugin: pane mod, skills, guard hooks
apps/cli                 atb
skills/                  vendored and owned skills (pinned)
workflow.example.json    default step to skill mapping
```

Tooling: pnpm workspaces, TypeScript strict mode, vitest, esbuild, Playwright for webview tests, `claude plugin test` for the plugin.

## 13. Coding standards

The project follows these standards. The repository states them in `CLAUDE.md`, and the lint configuration enforces them where a rule can do it.

**Format and tools**

- Prettier: semicolons, single quotes, no trailing commas, 2-space indent, print width 100, `prettier-plugin-tailwindcss`.
- EditorConfig: UTF-8, spaces, indent 2, final newline, trim trailing whitespace (except in Markdown).
- ESLint (flat config) with `typescript-eslint` and `react-hooks`. `no-explicit-any` is an error. `rules-of-hooks` is an error. `exhaustive-deps` is on.
- Pre-commit hook: type check, `lint:fix` on staged files, the leak check, and the docs lint. Nobody commits with `--no-verify`.

**Code**

- Every control-flow body has curly braces, including one-line `if` bodies.
- One folder for each kind of file in a module: `components/`, `hooks/`, `context/`, `utils/`, `types/`.
- One React component in each file.
- A blank line separates adjacent multiline JSX siblings.
- No comments by default. An inline comment has 2 lines at most.
- Fix a render-timing warning with the "adjust state during render" pattern. Do not use `useEffect(() => setState(...))` or a ref for the previous value.
- Never add `eslint-disable` for `react-hooks/exhaustive-deps`. Fix the dependency.
- Memoize only where it has a clear benefit: frequent re-renders with stable props, expensive derived values, or callbacks for memoized children.
- Use React state and context by default. Use Jotai atoms only when context would cause cascading re-renders, or when code outside React must read the state.
- Use a library helper (for example lodash) before a hand-written helper.
- One feature folder does not import from another feature folder. Shared code goes into a shared package.
- Use "time frame" for a start/end time range. Do not use "window".

**UI**

- Design system first. Use the existing theme tokens and shared components before you add new ones.
- Tailwind utility classes only. Do not add CSS files or new CSS rules. Theme variables and keyframes go into the one theme file.
- Use theme tokens. Do not write manual light/dark pairs.
- A hidden loader stops its animation. Tests assert that the hidden state has no animation class.
- Animate enter and exit, and add `motion-reduce:animate-none`.
- Do not put `backdrop-blur` on a transformed element.

**Accessibility**

- Use react-aria components for controls. Never use `<div onClick>`.
- Every control has an accessible name and works with the keyboard.
- Each test of a new UI component checks for accessibility violations.

**Tests**

- Tests sit next to the source as `X.test.ts(x)` and run on vitest (jsdom for UI).
- Run each test after you write it.
- Prefer role and name queries.
- Fixture dates are fixed values. No assertion depends on `Date.now()`.

**Docs**

- Plans, READMEs, specs and skill docs use Simplified Technical English. The repository vendors the MIT-licensed `asd-ste100` skill with its linter. CI fails on hard violations.
- Vendored skills are not edited. A `VENDORED.md` file in each vendored folder records the source and the version.

**Git**

- Commit, push and open a pull request only when the owner asks.
- Pull request titles: `<type>(<scope>): <description>`. Types: `feat`, `fix`, `perf`, `refactor`, `test`, `docs`, `style`, `chore`, `spike`, `infra`, `revert`. The description is lowercase, 72 characters at most, with no period at the end. The type, the scope and the ticket key do not count toward the 72.
- Screenshots and other scratch output go to an ignored folder, never into the working tree.

## 14. Milestones

`ROADMAP.md` lists the open work in each milestone.

**M0: Scaffold.** Workspace and the standards configuration from section 13. Lint, type check, tests, leak check hook, docs lint, example config, `CLAUDE.md` and CI for public pull requests.
Done when an empty build, the tests and the leak check pass.

**M1: Read-only board in both clients.** Config file, setup with Claude, tracker adapter, cache, sidebar, board, ticket page, comments and the Claude Code pane. Tracker transitions run from a drag, after a confirmation.
Done when both clients show the same tickets and comments from a cold start in less than 1 second after the first sync.

**M2: Service, menu bar and build.** Service API, menu bar app and process ownership. Ports, sessions in read-only and build modes, guards, slots and queue, Start and the test handoff.
Done when these 3 conditions are true:
- Start on a real ticket produces a worktree and a running app link.
- The guard refuses `git push`.
- Quit leaves no processes.

**M3: Review and pull request.** The Testing tab with evidence, and the agent review loop with its false-finding filter and final gate. Approval, push, CI, the draft pull request with screenshots, and the Code review tab.
Done when an approved ticket gets a draft pull request with no manual steps.

**M4: Workflow settings.** A settings page for the workflow and skills, swappable skills, pre-plan, drift, overlap and grouping.

### Status

M1 is done. In M2, these parts work in both clients:

- The service runs agent sessions with slots, a queue and Stop. Each ticket has an audit log.
- Planning gives requirements, steps, at most one round of questions, and assumptions.
- Development builds the approved plan in a worktree, and shows live step progress and the final gate.
- A problem says what is wrong and why. When only checks remain that the build cannot run, "Move to Testing" comes first.

Testing works too: the agent checks its own screenshots in the live app before the developer sees them. Development is one agent session for now. The reviewer agents and the verifier come in M3.

## 15. Open questions

- None at this time. The license is MIT. The name is Agent Ticket Board.
