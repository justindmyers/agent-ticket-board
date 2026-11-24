---
description: Set up Agent Ticket Board. Find the config values, then review them with the developer.
argument-hint: '[tracker|repo] [--repo=<path>]'
allowed-tools: Bash(node ~/.agent-ticket-board/bin/atb.cjs detect:*), Bash(node ~/.agent-ticket-board/bin/atb.cjs config), Read
---

# Set up Agent Ticket Board

Do these steps in sequence. Do not save a value until the developer accepts it.

1. Run `node ~/.agent-ticket-board/bin/atb.cjs detect $ARGUMENTS`.
   - If the arguments name a section, use `--only=tracker` or `--only=repo`.
   - If the arguments name a folder, use `--repo=<folder>`.
2. Read the `checks` list. If a check fails, show its `detail` to the developer and stop.
3. Read the `gaps` list. For each gap, read only the files that the gap names. Then propose one value for its key.
   - For `repo.prTitle`, write a template that uses `{type}`, `{scope}`, `{description}` and `{key}`.
   - Set the confidence to `low` and the source to `Claude: <file>`.
4. Run `node ~/.agent-ticket-board/bin/atb.cjs config` to get the current values.
5. Show one table with these columns: key, current value, proposed value, confidence and source.
   - Put the values with `low` confidence first.
   - Show a value that is the same as the current value as "no change".
6. Ask the developer which values to save. The developer can also type a different value.
7. For each accepted value, run `node ~/.agent-ticket-board/bin/atb.cjs config set <key> '<JSON value>'`.
   This command is not in the allowed tools. Thus Claude Code asks the developer before each save.
8. Tell the developer to refresh the board.

## Rules

- Read only the files that a gap names. Do not read other files in the repository.
- Do not write to the tracker. Detection only reads.
- Do not show tokens, email addresses or account names.
