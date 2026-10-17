---
description: Show what Ariadne's hooks last recorded here - the checks still blocking, the rounds used, the subagents running and the complexity debt files.
allowed-tools: Bash(CLAUDE_PLUGIN_DATA="${CLAUDE_PLUGIN_DATA}" "${CLAUDE_PLUGIN_ROOT}/bin/ariadne" status)
---

# Ariadne status

Run this once, from the project folder:

```sh
CLAUDE_PLUGIN_DATA="${CLAUDE_PLUGIN_DATA}" "${CLAUDE_PLUGIN_ROOT}/bin/ariadne" status
```

- Always run the binary by this exact path, in double quotes. Never use a bare
  `ariadne`.
- It only reads. It writes nothing.
- Show its output to the user as it is printed, in a code block. Do not shorten it, put
  it in your own words or add to it.
- If it exits with an error, show its one-line message and stop.
