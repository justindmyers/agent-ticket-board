---
name: Agent Ticket Board
description: A fast ticket queue where a coding agent does the work between your approvals.
colors:
  accent: "#116EEA"
  accent-text-dark: "#3C8AF1"
  surface-light: "#FFFFFF"
  surface-dark: "#09090B"
  surface-card-light: "#FFFFFF"
  surface-card-dark: "rgba(24, 24, 27, 0.7)"
  card-border-light: "#CBD5E1"
  card-border-dark: "rgba(39, 39, 42, 0.3)"
  card-ring-light: "rgba(203, 213, 225, 0.3)"
  card-ring-dark: "rgba(39, 39, 42, 0.3)"
  row-hover-light: "rgba(226, 232, 240, 0.75)"
  row-hover-dark: "rgba(39, 39, 42, 0.75)"
  text-light: "#1E293B"
  text-dark: "var(--vscode-foreground)"
  text-muted-light: "rgba(0, 0, 0, 0.55)"
  text-muted-dark: "rgba(251, 251, 251, 0.55)"
  needs-you: "#FAC84F"
  needs-you-text-light: "#7D5700"
  problem: "#FA4045"
  problem-text-light: "#C8262B"
  running: "#0096C8"
  done: "#1EC46E"
  done-text-light: "#13804A"
typography:
  title:
    fontFamily: "var(--vscode-font-family), system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.35
  body:
    fontFamily: "var(--vscode-font-family), system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "var(--vscode-font-family), system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.35
  micro:
    fontFamily: "var(--vscode-font-family), system-ui, sans-serif"
    fontSize: "10px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.08em"
  key:
    fontFamily: "var(--vscode-editor-font-family), Menlo, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.35
rounded:
  small: "4px"
  medium: "6px"
  large: "10px"
  larger: "16px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  queue-row:
    height: "32px"
    padding: "0 10px"
  queue-row-selected:
    backgroundColor: "{colors.row-hover-dark}"
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "#FFFFFF"
    rounded: "{rounded.medium}"
    padding: "4px 10px"
  button-needs-you:
    textColor: "{colors.needs-you}"
    rounded: "{rounded.medium}"
    padding: "2px 8px"
  card:
    backgroundColor: "{colors.surface-card-dark}"
    rounded: "{rounded.large}"
    padding: "12px"
  chip:
    rounded: "{rounded.full}"
    padding: "1px 8px"
---

# Design System: Agent Ticket Board

## Overview

Reference look (v0.0.8): the owner's product "model" view. The ground is near-black. Glass panels have a tint of one accent colour (a 160° gradient from the accent into the ground). Square icon tiles have a radial accent fill and a soft glow. Small orbs glow. Group labels are uppercase with a dot. The stages use a segmented pill control. Text is white at set opacities. The font is the VS Code UI font (a test without Poppins, v0.0.10).

Accent palette: blue `#3A86FE` (Planning), aqua `#64E4ED` (Development), amber `#FFBE0C` (Testing), green `#1EC46E` (Code review), rose `#F472B6` (Ship), violet `#A78BFA` (the agent asks you something), red `#FA4045` (a problem), neutral `#96969D` (not started). A panel glows strongly only when the ticket waits for the developer.

An operations tool that sits inside the editor. The developer looks at it many times an hour, acts in one or two keystrokes and goes back to code. Quality bar: Linear for speed, density and keyboard flow. Look: dark glass surfaces on a near-black ground, thin low-contrast borders, and a soft glow only on items that need the developer.

Layout: inbox split. The queue is on the left and the selected ticket is on the right. The VS Code sidebar shows the queue only.

Theme: the views follow the light or dark theme of VS Code. In a high-contrast theme, the views use the VS Code theme colors only and show no glow, blur or transparency.

## Colors

### Primary
- **accent** (`#116EEA`): selection, focus ring, primary buttons. On dark surfaces, text in the accent color uses `accent-text-dark` (`#3C8AF1`, 4.9:1 on a card).

### State colors
Each state color has one meaning. Do not use a state color for decoration.
- **needs-you** (`#FAC84F`): the agent waits for the developer (approve the plan, test, answer a question). This is the only color that glows. On light surfaces, text uses `needs-you-text-light` (`#7D5700`, 5.5:1 on a selected row).
- **problem** (`#FA4045`): a failed check, a blocked agent, a changed ticket. On light surfaces, text uses `problem-text-light` (`#C8262B`, 5.6:1).
- **running** (`#0096C8`): the agent works. Quiet: a dot and a step count, no glow, no animation except a slow pulse that stops when reduced motion is on.
- **done** (`#1EC46E`): a completed stage. On light surfaces, text uses `done-text-light`.

### Neutral
- **surface**: the VS Code editor background, so the view sits in the editor. The `surface-*` values are the fallback outside VS Code.
- **surface-card**: in dark themes, the surface mixed with 4% white, so a card is always lighter than the editor background. In light themes, white.
- **card-border** and **card-ring**: thin, low-contrast edges.
- **text**, **text-muted**: body and secondary text. In dark themes, text is the VS Code foreground (about #ccc), not white. White text on a near-black surface looks like it glows. Muted text must stay 4.5:1 or more on its surface.

### Named Rules
- **Loud problems, quiet progress.** Only the header of a ticket that waits for the developer glows (`needs-you`, or `problem`). Status dots are flat. All other states are a dot and text.
- **Color is never the only signal.** Each state also has an icon or a word.
- **Generic names only.** No token, class or text names a company or a product.

## Typography

The views use the VS Code UI font and the editor mono font for ticket keys. No web font loads.

### Hierarchy
- **title** (600, 15px): ticket title on the ticket pane.
- **body** (400, 13px): requirements, plan, comments.
- **label** (500, 12px): queue rows, buttons, tabs.
- **micro** (600, 10px, caps, 0.08em): group headers such as "Needs you".
- **key** (mono 12px): ticket keys, branch names.

## Layout

- Queue rows are 32px high, one line, with the ticket key, the title (truncated), and at most one action button on the right.
- Group order: Needs you (problems first, then decisions), Running, then the tracker statuses. A group with no items does not show.
- The ticket pane, from top to bottom: the header (key, title, status, points, overflow menu) and the "needs you" banner if the agent waits. Then the stage tabs, the tab content and the comment thread.
- Width below 640px: the split becomes a list. Enter opens the ticket, Escape goes back.
- Spacing scale: 4, 8, 12, 16, 24px.

## Elevation & Depth

Depth comes from translucency and blur, not from heavy shadows. Cards: card background, 1px border, 1px ring, a soft shadow and `backdrop-filter: blur(12px)`. Overlays (menus, the move dialog): the same surface at a higher opacity with a stronger shadow. The glow on a `needs-you` item is a 0 0 12px shadow in the state color at 35% opacity.

## Motion

Motion shows where content comes from and where it goes. It asks for attention in one case only: an agent that runs now.

- Content that changes height, such as notices and banners, uses the shared `Collapse` component. It animates height and opacity, so the layout around it does not jump.
- Queue groups use the height transition of the react-aria disclosure panel. The chevron turns.
- Items that move to a new place, such as board cards, use the framer-motion `layout` glide.
- A ticket page fades up when it opens. A stage tab fades in. Menus and selects scale in from their trigger.
- Keyframes and `--animate-*` tokens live in `styles.css` only. Durations and the ease curve live in `shared/utils/motion.ts`.
- The ease is a soft deceleration. Enter and collapse take about 200 ms.
- With reduced motion, framer-motion durations are zero and the CSS animations stop. Opacity fades can stay.
- A selected row changes color only. It never changes size.
- A running agent has a moving border. A light of its color goes around its list row, its board card and its "Planning now" section. Use the `run-border` utility with `runColor`. With reduced motion, the full border shows the color and does not move.
- In the Claude Code pane, a running agent's border pulses in brightness. The timer stops when no agent runs in the view.

## Shapes

Radius: 4px for chips inside rows, 6px for buttons and inputs, 10px for cards and the banner, 16px for dialogs. Status dots are 8px circles.

## Components

Built with React, Tailwind CSS and react-aria-components. The tokens are a Tailwind `@theme`. The queue is a ListBox, the stages are Tabs, the overflow menu is a Menu, and the comment box is a TextField.

### Ticket text
The Jira description splits at its headings. The context shows in a "Ticket" card, and acceptance criteria show in their own card. Notes that someone added to the ticket (for example an agent's analysis) show in a separate card with their own heading. Long context shows the first part and a "Show full description" button.


### Queue row
Line 1: dot, key and points (or the step count). Line 2: the full title, which wraps and is never cut off. Line 3, only when the agent waits: its one-line request in the state color. Titles use normal weight. Selection follows focus. The developer can drag the edge of the queue to change its width (240 to 600px), or focus the edge and use the arrow keys.

### "Needs you" banner
One line: what the agent needs, in the agent's own short words or in fixed text ("Ready to test. 4 of 4 requirements have evidence."). Then the actions. No other agent text shows in the views.

### Stage tabs
Planning, Development, Testing, Code review, Ship. A finished stage has a check mark. The current stage has the accent underline and opens by default. A stage with no data yet shows a one-line empty state, not a blank tab.

### Sections

A section with content has a chevron beside its title. The title is a button: it collapses the section to its title, its caption and its count. Buttons in the header stay in view. The choice is saved for each section title. The Claude Code pane has the same toggle, with ▾ and ▸.

### Buttons
Primary: accent background. Needs-you action: state-color text and border. Secondary: border only. Every button has a visible focus ring (2px accent, 2px offset).

### Chips
Status, points and evidence chips: full radius, border only, label typography.

### Loading
The views draw from the local cache at once. A refresh shows a small "updating" chip in the header. A cold start shows skeleton rows in the shape of the real rows. No spinners in place of content.

## Do's and Don'ts

- Do keep every action one keystroke or one click from the queue.
- Do show the age of the cached data when the tracker is offline.
- Don't show agent chat, logs or progress text in the views. The chat stays in Claude Code.
- Don't glow, animate or color anything that does not need the developer.
- Don't copy Linear's look. Match its speed and finish.
- Don't name a company or a product in tokens, classes or text.

### Tooltips

A button hides the commands that it runs. Each button that runs something shows what it runs.

- VS Code shows a tooltip on hover and on keyboard focus. The `Button` takes a `help` text.
- The pane has no hover. It shows the same text as a dim line under the buttons of the banner.
- The text is one function, `actionHelp`, in `look.ts`. Both surfaces read it, so they say the same.
- The text names the real command: `git push origin HEAD:<branch>`, `gh pr create --draft`, `gh pr edit`.
- A test fails when a button id has no text. A new button cannot ship without one.
- A word has one meaning. "Create" makes a thing on GitHub. "View" opens it in the browser.

