# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

The views are web UI inside VS Code (webviews) and a pane inside Claude Code (desktop app and terminal). A native macOS menu bar app controls the background service.

## Stack

React, Tailwind CSS and react-aria in the VS Code webviews. A Claude Code plugin (mod) for the Claude Code pane. Node for the service. SwiftUI for the menu bar app.

## Users

- Primary: the owner and the owner's coworkers. Each is a developer who works on their own sprint tickets with a coding agent, often several tickets at the same time. They move between their code and the board many times a day.
- Secondary: any developer with a Jira and GitHub workflow. The product must work for them without changes to the code.
- Some users do not use VS Code. They use the Claude Code pane and must get the same functions.

## Product Purpose

The board moves tickets through a queue quickly: Planning, Development, Testing and Code review. The developer approves at each checkpoint and the agent does the work between them. Sometimes a problem occurs: a failed check, a blocked agent, a question or a changed ticket. The developer then sees it at once and can react in one or two actions.

Success: the developer spends little time on the board and never misses an item that waits for them. The developer never needs to open the tracker to move a ticket.

## Positioning

- The tracker is the source of truth for status. The board does not keep a second status that can drift.
- No agent work starts without a click from the developer.
- The agent never pushes and never opens a pull request before the developer approves.
- All organization settings are configuration. Claude finds most values from the tools that the developer already signed in to.

## Operating Context

- Tickets come from Jira (read through `acli`). Code and pull requests are on GitHub (`gh`).
- Each ticket has its own git worktree, its own Claude Code session and a comment thread for the agent.
- Several builds run in parallel. Dev servers use leased ports.
- After a draft pull request opens, another person reviews it on GitHub. The workflow ends at the merge.

## Capabilities and Constraints

- Stages: Planning, Development, Testing, Code review. These names are fixed product terms.
- The views show no agent chat. When the agent needs something from the developer, the view shows the request in one line with the action for it. The full chat stays in Claude Code.
- Board columns are the tracker statuses. A drag on the board runs a tracker transition after a confirmation.
- Public open-source repository (MIT). It contains no organization data and no personal data.
- Every function ships in the VS Code extension and in the Claude Code pane.
- Each view draws from a local cache at once and refreshes in the background.
- Undecided: the onboarding flow for a new user, and the exact layout of the settings page.

## Brand Commitments

- Name: Agent Ticket Board. CLI: `atb`.
- Visual authority: the look of the owner's existing product UI (glass surfaces, soft glows on items that need attention). It follows the light or dark theme of VS Code. Every token has a generic name. No token, class or text names a company or a product.
- Craft reference: Linear. Match its speed, density, keyboard flow and finish to some degree. Do not copy its look.

## Evidence on Hand

- Spike screenshots and code in a private folder outside the repository. They contain real ticket data and must not go into the repository.
- No customers, metrics or testimonials exist. Do not invent them.

## Product Principles

1. Speed through the queue: the next action for each ticket is one click away.
2. Problems are loud, everything else is quiet: an item that needs the developer is impossible to miss, and normal progress does not ask for attention.
3. Show only what the current stage needs, with every other stage one click away.
4. No hidden automation: every state change has a visible cause.
5. Same functions in every client.

## Accessibility & Inclusion

WCAG 2.2 AA. Every view works with the keyboard only and in the VS Code high-contrast themes. Motion respects the reduced-motion setting.
