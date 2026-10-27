---
description: Clear Ariadne's complexity debt for this repository or worktree - shows what would go, asks you to confirm, then removes it. It cannot be undone.
allowed-tools: Bash(CLAUDE_PLUGIN_DATA="${CLAUDE_PLUGIN_DATA}" "${CLAUDE_PLUGIN_ROOT}/bin/ariadne" debt clear --dry-run), Bash(CLAUDE_PLUGIN_DATA="${CLAUDE_PLUGIN_DATA}" "${CLAUDE_PLUGIN_ROOT}/bin/ariadne" debt clear), AskUserQuestion
---

# Clear Ariadne's complexity debt

1. Run this once, from the project folder. It only reads:

   ```sh
   CLAUDE_PLUGIN_DATA="${CLAUDE_PLUGIN_DATA}" "${CLAUDE_PLUGIN_ROOT}/bin/ariadne" debt clear --dry-run
   ```

2. Show its output to the user as it is printed, in a code block. Do not shorten it, put
   it in your own words or add to it.
3. If it says `No complexity debt is recorded here.`, or that the record is not cleared,
   stop.
4. Otherwise ask the user with the AskUserQuestion tool: "Clear this complexity debt?
   It cannot be undone." with two options, `Yes, clear it` and `No, keep it`.
5. Only if the user picks `Yes, clear it`, run:

   ```sh
   CLAUDE_PLUGIN_DATA="${CLAUDE_PLUGIN_DATA}" "${CLAUDE_PLUGIN_ROOT}/bin/ariadne" debt clear
   ```

   and show its one-line output. For any other answer, say the debt was kept and stop.

- Always run the binary by this exact path, in double quotes. Never use a bare
  `ariadne`, and never delete Ariadne's files yourself.
- If a command exits with an error, show its one-line message and stop.
