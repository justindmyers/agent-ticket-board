# Agent Ticket Board: instructions for agents

Read `PLAN.md` for the architecture, `ROADMAP.md` for the open work, `PRODUCT.md` for the users and the principles, and `DESIGN.md` for the tokens and the components.

## Layout

| Folder | Contents |
| --- | --- |
| `packages/core` | Types, the Jira and GitHub adapters, the cache, the queue model, comments, Jira moves and the sync rules. |
| `apps/cli` | The `atb` command line tool. |
| `apps/vscode` | The VS Code extension. `src/` is the extension host. `webview/` is the React UI. |
| `apps/claude-plugin` | The Claude Code pane and the guards. |
| `scripts` | The leak check, the docs lint and the local install. |
| `skills` | Vendored skills. Do not edit them. |

## Project rules

- Every UI change goes into all clients in the same change. The clients are the sidebar queue, the ticket page, the board tab and the Claude Code pane. Then run the tests for each client.
- The repository contains no employer names, project keys, field ids, ticket data, personal names or paths. Use invented data, for example `PROJ-123` and `example.atlassian.net`.
- The only Jira write is a status change in `packages/core/src/moves.ts`. It needs the approval of the developer, or the per-ticket permission for the agent.
- Do not commit, push or open a pull request unless the owner asks.

## Coding standards

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
- Pull request titles: `<type>(<scope>): <description>`. Types: `feat`, `fix`, `perf`, `refactor`, `test`, `docs`, `style`, `chore`, `spike`, `infra`, `revert`. The description is lowercase, 72 characters at most, with no period at the end.
- Screenshots and other scratch output go to an ignored folder, never into the working tree.

