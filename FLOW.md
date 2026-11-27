# How the board works

Seven charts show the whole system. Each chart ends with the places where you can check it: an audit event, a field of the ticket record, or a command. Nothing here needs the code.

Colour key: amber = a step that needs you. Violet = an agent works. Blue = the board runs it with no agent. Grey dashed = planned, not built yet.

## 1. The parts

```mermaid
flowchart LR
  subgraph EXT["Outside systems - the board only reads them"]
    JIRA["Jira, through acli"]
    GH["GitHub, through gh"]
    GIT["Your repository and its worktrees"]
  end

  subgraph CLIENTS["What you use"]
    VSC["VS Code extension"]
    PANE["Claude Code pane"]
    CLI["atb command line"]
  end

  CORE["Shared core library<br/>records, prompts, rules"]
  SVC["Board service<br/>localhost, one process<br/>queue, agent runs, checks"]
  STORE[("~/.agent-ticket-board<br/>agents/KEY.json = the ticket record<br/>tickets/KEY/events.jsonl = audit log<br/>tickets/KEY/runs/ = each agent run<br/>comments.json, config.json, cache/")]
  SDK["Claude Agent SDK sessions<br/>one agent per run"]
  APP["Test app and browser<br/>one per ticket, Testing only"]

  VSC --> CORE
  PANE --> CLI
  CLI --> CORE
  CORE --> JIRA
  CORE --> GH
  CORE --> GIT
  VSC -->|"start, stop, approve"| SVC
  CLI -->|"start, stop, approve"| SVC
  SVC --> SDK
  SVC --> APP
  SVC --> GIT
  SVC --> STORE
  CORE --> STORE
  STORE -.->|"file watch in VS Code,<br/>reload every 3 s in the pane"| CLIENTS
```

Check it: `atb service` prints the service pid and the tickets with an active run. `~/.agent-ticket-board/service.json` holds its port.

## 2. How tickets arrive

```mermaid
sequenceDiagram
  autonumber
  participant You
  participant Client as VS Code or pane
  participant Core as Core library
  participant Jira as Jira (acli)
  participant GH as GitHub (gh)
  participant Git as Local git
  participant Store as Cache and records

  You->>Client: Open the board
  Client->>Store: Read the cached sprint
  Client-->>You: Show the cached list at once
  Client->>Core: Refresh the sprint
  Core->>Jira: Run the configured JQL query
  Jira-->>Core: Ticket list: key, summary, status
  Core-->>Client: Show the list, details still loading
  loop Each ticket
    Core->>Jira: Read points, description, comments
    Core-->>Client: Fill in the row
  end
  Core->>Store: Save the sprint cache
  Core->>GH: Find the pull request of each ticket key
  Core->>Git: Find branches and worktrees that contain the key
  Client->>Core: Combine Jira status, pull request and agent record
  Note over Client,Core: Jira says Done, or the pull request merged:<br/>the ticket closes. A merged pull request with Jira<br/>not Done offers "Move to Done" for you to approve.
  Client-->>You: Rows grouped by status, each with its next step
```

Check it: `atb sprint --cached` prints the cache. A ticket with work in git but no record shows an "adopt" offer. The only Jira write is a status move that you approve (event `move` in `events.jsonl`).

## 3. The stages and who decides

```mermaid
flowchart TD
  START["Ticket in the sprint"] --> PLAN

  PLAN["PLANNING<br/>agent, read-only<br/>requirements with checks, steps,<br/>assumptions, backend writes,<br/>at most 3 blocking questions"]:::agent
  PLAN -->|"questions"| ANSWER["You answer, or re-plan"]:::human
  ANSWER --> PLAN
  PLAN --> G1{"You: Approve plan and start"}:::human

  G1 --> DEV["DEVELOPMENT<br/>agent builds step by step<br/>in a new worktree"]:::agent
  DEV --> DEVCHK["The board runs your repository checks"]:::board
  DEVCHK -->|"a check fails"| DEVFIX["Back to Development<br/>with the failing output"]:::agent
  DEVFIX --> DEV
  DEVCHK -->|"all pass"| TEST

  TEST["TESTING<br/>agent checks each requirement<br/>in the live app, with screenshots"]:::agent
  TEST -->|"a requirement fails"| TESTAGAIN["Test again, or comment and re-plan"]:::human
  TESTAGAIN --> TEST
  TEST --> G2{"You: Approve for code review"}:::human

  G2 --> REVIEW["CODE REVIEW<br/>reviewers, fixes,<br/>board checks, commits,<br/>pre-push gate"]:::agent
  REVIEW --> G3{"You: approve the push"}:::planned
  G3 --> PR["Push, draft pull request,<br/>screenshots attached"]:::planned
  PR --> FOLLOW["Follow checks, reviews and comments<br/>until the merge"]:::planned
  FOLLOW --> JIRAMOVE{"You: approve the Jira move"}:::human
  JIRAMOVE --> DONE["Closed"]

  RESTART["Start over, any time:<br/>archive, remove worktree,<br/>back to Planning with lessons"]:::human -.-> PLAN

  classDef human fill:#3d2f06,stroke:#f5b82e,color:#fff
  classDef agent fill:#2a1f4d,stroke:#9b7bf0,color:#fff
  classDef board fill:#0f2f4a,stroke:#4aa3e8,color:#fff
  classDef planned fill:#222,stroke:#777,stroke-dasharray:5 4,color:#aaa
```

Check it: the field `stage` of `agents/KEY.json` is `planning`, `development`, `testing` or `code-review`. The field `need` is the one line and the buttons you see. Moves and approvals are in the audit log: `testing.approved`, `start-over`.

## 4. The life of one agent run

```mermaid
sequenceDiagram
  autonumber
  participant You
  participant Svc as Board service
  participant Rec as Ticket record
  participant Ag as Agent session (SDK)
  participant Guard as Guard hook

  You->>Svc: Press a button (plan, develop, test, review)
  Svc->>Svc: Refuse if a rule fails, for example no plan or no worktree
  Svc->>Rec: Write run = queued
  Note over Svc: At most 3 agent runs at once.<br/>Testing runs one at a time: one app, one browser.
  Svc->>Ag: Start with the prompt, the ticket comments,<br/>the repository memory, a cost cap, a command allowlist
  Svc->>Rec: Write run = running
  loop Each tool call
    Ag->>Guard: Run this command
    Guard-->>Ag: Allow, or refuse
    Ag-->>Svc: Progress message
    Svc->>Rec: Update the activity line, report steps
  end
  Note over Guard: Refused: git push, GitHub writes, Jira writes,<br/>a dev server, a second heavy command at once
  Ag-->>Svc: Final answer in a fixed JSON shape
  alt The answer is valid
    Svc->>Rec: Apply it: plan, steps, evidence, findings, or commit plan
    Svc->>Rec: Write run = done, cost, and your next step
  else Wrong shape, cost cap hit, or error
    Svc->>Rec: Write run = failed, with the reason and a Try again button
  end
  Svc-->>You: The page updates from the record file
```

Check it: every run has a folder `tickets/KEY/runs/<time>-<stage>/` with `prompt.md`, `messages.jsonl` (everything the agent did), `output.json`, `summary.json` (cost, turns) and `options.json` (the allowlist). The audit log shows `run.queued`, `run.started`, `run.done` or `run.failed`, and `tools.refused` with each refused command.

## 5. Development and Testing

```mermaid
flowchart TD
  OK["Plan approved"] --> WT["Make the worktree<br/>from today's origin/main<br/>with your worktree script"]:::board
  WT --> STEPS["Agent does the plan steps in order<br/>reads CLAUDE.md and the repository skills first<br/>reports each step: current, done"]:::agent
  STEPS --> FINAL["Agent's own final gate<br/>type check, lint, tests"]:::agent
  FINAL --> BOARD["The board runs repo.checks<br/>and ignores the agent's claim"]:::board
  BOARD -->|"fail"| BACK["Stay in Development<br/>button: Fix and build again<br/>next build gets the output"]:::agent
  BACK --> STEPS
  BOARD -->|"pass"| READY["Ready to test"]

  READY --> APPUP["Board starts the app on a free build port<br/>and opens the ticket's browser"]:::board
  APPUP --> LOGIN{"Logged in?"}
  LOGIN -->|"no"| YOU["You log in once<br/>the run waits"]:::human
  YOU --> LOGIN
  LOGIN -->|"yes"| CHECK["Agent checks each requirement:<br/>its test, or the live app<br/>3 sizes, light and dark screenshots"]:::agent
  CHECK --> GUARD["Test browser guard<br/>reads and GraphQL queries pass<br/>a write passes only if you approved it"]:::board
  GUARD --> LOOK["Agent views every screenshot,<br/>fixes what looks wrong, shoots again"]:::agent
  LOOK --> EVID["Evidence for each requirement<br/>passes, or a note why not<br/>tagged: real data, fake data, test only<br/>each approved write: made, or not made"]
  EVID -->|"any fails"| RETRY["You: Test again, or comment and re-plan"]:::human
  EVID -->|"all pass"| APPROVE{"You: Approve for code review"}:::human
  APPROVE --> CLOSE["Browser and app close"]:::board

  classDef human fill:#3d2f06,stroke:#f5b82e,color:#fff
  classDef agent fill:#2a1f4d,stroke:#9b7bf0,color:#fff
  classDef board fill:#0f2f4a,stroke:#4aa3e8,color:#fff
```

Check it: `steps` in the record show each step as todo, current or done. `gate` shows the board's own check result, step by step. `evidence` has one entry for each requirement, with its screenshot paths. Screenshots are in `tickets/KEY/shots/`. Each entry also has `data`: `real`, `fake` or `none`. `writeRuns` lists each approved write with `made` and its result. A pass on fake data still lets you approve. The decision text names the fake data and the writes that were not made.

## 6. Code review, commits and the pre-push gate

```mermaid
flowchart TD
  A["You approve the tested change"]:::human --> R

  R["REVIEW RUN<br/>reviewers read the diff:<br/>correctness, code style,<br/>and the agents of your repository<br/>such as a11y and reuse"]:::agent
  R --> V["A checker opens the source for each finding<br/>and drops what the code does not show"]:::agent
  V --> F["Agent fixes each confirmed blocking finding<br/>style notes stay as they are"]:::agent
  F --> OPEN{"Blocking finding<br/>left open?"}
  OPEN -->|"yes"| RA["Review again"]:::human
  RA --> R
  OPEN -->|"no"| CHK
  V -.-> CHOOSE["You choose on any finding:<br/>Fix, Dismiss, or Fix anyway for a dropped one"]:::human
  CHOOSE --> FIXCH["FIX RUN: agent fixes only the chosen findings<br/>no new review, no commit"]:::agent
  FIXCH --> CHK

  CHK["BOARD CHECKS on the uncommitted change<br/>contracts, type checks, eslint, prettier,<br/>changed tests, comment and import checks<br/>only on lines the ticket changed"]:::board
  CHK -->|"fail"| FIXRV["Fix and review again<br/>the failing output goes to the agent"]:::agent
  FIXRV --> R
  CHK -->|"pass"| PREP

  PREP["Before-commit commands<br/>generators, new-component test rule"]:::board
  PREP -->|"fail"| PREPFIX["Fix it, plan again"]:::human
  PREPFIX --> PREP
  PREP -->|"pass"| CP

  CP["COMMIT PLAN<br/>agent groups the files into atomic commits<br/>type(scope): description (KEY)"]:::agent
  CP --> READ{"You read the plan"}:::human
  READ -->|"plan again"| CP
  READ -->|"make these commits"| COMMIT

  COMMIT["Board makes each commit in order<br/>your git hooks run, never --no-verify"]:::board
  COMMIT -->|"a hook refuses"| HOOKFAIL["Stops there, keeps earlier commits,<br/>shows the hook output"]:::human
  COMMIT --> GATE

  GATE["PRE-PUSH GATE<br/>1 worktree is clean<br/>2 fetch origin/main<br/>3 run the checks<br/>4 merge origin/main, never rebase<br/>5 run the checks again if the merge changed anything"]:::board
  GATE -->|"merge conflict"| UNDO["Merge is undone, tree stays clean"]:::human
  GATE -->|"pass"| PUSH

  PUSH{"You: approve the push"}:::planned
  PUSH --> PR["git push origin HEAD:branch<br/>draft pull request, 6 screenshots attached"]:::planned
  PR --> TRACK["Follow checks, reviews, comments to the merge<br/>fixes go through comment and re-plan"]:::planned

  classDef human fill:#3d2f06,stroke:#f5b82e,color:#fff
  classDef agent fill:#2a1f4d,stroke:#9b7bf0,color:#fff
  classDef board fill:#0f2f4a,stroke:#4aa3e8,color:#fff
  classDef planned fill:#222,stroke:#777,stroke-dasharray:5 4,color:#aaa
```

Not built yet (grey): the push, the draft pull request, and the pull request tracking. Today the flow ends after the pre-push gate.

Check it: `codeReview.findings` lists each finding as `fixed`, `open` or `dropped`, with the reviewer, file and line. A finding that you chose has `decision`: `fix` or `dismiss`. A dismissed finding never blocks. Audit event: `finding`. `gate.steps` lists each check and its output. `commits.done` lists each commit and its short hash. Audit events: `verify.started`, `gate.done`, `before-commit`, `commit.made`, `commit.failed`.

## 7. What the board may write

```mermaid
flowchart LR
  subgraph AGENT["Agents"]
    AG1["Planning: reads only"]
    AG2["Development, Testing, Review:<br/>edit files in the ticket worktree"]
    AG3["Commit plan: reads only"]
  end

  subgraph BOARD["The board itself"]
    B1["Runs your checks"]
    B2["Makes commits<br/>after you read the plan"]
    B3["Merges origin/main<br/>in the worktree"]
  end

  subgraph YOU["Only you"]
    Y1["Approve the plan"]
    Y2["Approve for code review"]
    Y3["Approve a Jira status move"]
    Y4["Start over: removes the worktree"]
  end

  subgraph NEVER["Refused for every agent"]
    N1["git push"]
    N2["GitHub writes"]
    N3["Jira writes"]
    N4["Starting a dev server<br/>or a second heavy command"]
  end

  AGENT -.- NEVER
```

Check it: a refused command is in the audit log as `tools.refused`. The guard rules are in `apps/claude-plugin/hooks/guards.ts`.

## Where to look when something seems wrong

| You see | Look at |
|---|---|
| A button does nothing | `atb service` for an active run. Then the last lines of `tickets/KEY/events.jsonl`. |
| A run failed | `tickets/KEY/runs/<latest>/summary.json`, then `messages.jsonl` for the last tool results. |
| The wrong next step | `need` in `agents/KEY.json`. |
| A check failed | `gate.steps` in the record. The note holds the last lines of the output. |
| An agent was blocked | `tools.refused` in the audit log. |
| Cost | `spent` in the record. Each run's `summary.json` has its own cost. |
