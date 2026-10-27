# Messages

Everything Ariadne prints starts with `Ariadne`. This page lists what you will see in
Claude Code and what it means.

There are two kinds of message:

- **Reports** go to the agent. They block it and tell it what to fix. Claude Code shows
  them to you too, as hook feedback.
- **Status lines** are for you. One appears when a turn ends. The agent does not see it.

## While the agent edits

After each Write or Edit, and after each Bash command that changed source files,
Ariadne checks the functions that changed. If one is over its limit, the edit is
blocked with a report like this:

```
Ariadne: 1 function above complexity limits in mathlab/matrix.go

  Inverse (lines 94-146)
    cognitive  34 > 15    cyclomatic 16 > 15
    top contributors (cognitive):
      L133  if (nesting 4)            +5
      L132  loop (nesting 3)          +4
      L112  if (nesting 2)            +3

Refactor these functions to meet the limits without changing behavior.
...
```

How to read it:

- `cognitive 34 > 15`: the function scored 34; the limit is 15.
- `top contributors`: the lines that cost the most. `if (nesting 4) +5` means an `if`
  inside four levels of nesting added 5 points.
- The last paragraph tells the agent how to fix it, and that the limits are your rules
  (the built-in defaults, or the ones in your `.ariadne.toml`). Asking for complex code
  in the conversation does not change them, and the agent is told not to go looking for
  or editing configuration: it has to refactor.

A function can also be blocked for a code smell: too long, too many parameters, or
nested too deeply. Those scores appear only when they are over the limit:

```
Ariadne: 1 function above complexity limits in report/build.go

  Build (lines 12-123)
    cognitive  9 <= 15    cyclomatic 7 <= 15    length     112 > 80    parameters 9 > 7    nesting    5 > 4 (deepest at L88)

Split long functions into smaller ones with one job each, outside this function (a function nested inside it still counts toward its length).
Group related parameters into a struct, or split the function.
Reduce nesting: return early, or move the inner block into its own function.

Refactor these functions to meet the limits without changing behavior.
...
```

- `length 112 > 80`: the function is 112 lines long, blank and comment lines included.
- `parameters 9 > 7`: it declares 9 parameters (the receiver or `self` does not count).
- `nesting 5 > 4 (deepest at L88)`: `if`s, loops and `switch`es are nested 5 deep; the
  deepest one starts on line 88. This counts from 1 (one `if` is nesting 1), while the
  `(nesting N)` next to a contributor counts from 0, so the same line can show both
  `nesting 5` here and `(nesting 4)` there.
- Each smell over the limit adds one hint line on how to fix it, just before the last
  paragraph.

Claude Code shows this as a hook error under the tool call. The file is still written;
the agent is expected to fix it next.

## When the agent tries to finish

When the agent ends its turn, Ariadne runs three checks on what changed: **lint**,
**complexity** (all five scores, smells included), then **tests**. While they run, Claude Code shows:

```
Ariadne: checking lint, complexity and tests (this can take a few minutes)
```

Lint and tests are your project's own commands (`go vet`, `cargo test`, ...), so on a
large project this can take minutes. Nothing is stuck: wait for it. If you interrupt it,
the same checks run again at the end of your next turn. When a subagent hands its work
back you see `Ariadne: checking the subagent's lint, complexity and tests` instead.

If a check fails, the agent cannot stop yet. It gets one report with every failure, and
Claude Code shows it as `Stop hook feedback`.

The report ends with a round counter:

```
Ariadne: round 2 of 5
```

The agent gets a limited number of rounds (5 by default) to fix everything. On the last
round the report adds:

```
This is the last round. Complexity limits are not optional: refactor every listed
function now. Only a lint or test failure you cannot fix yourself (a missing tool, a
broken environment) may be left, explaining what remains and why.
```

A failing lint or test command appears as `lint failed: <command> in <directory>` or
`tests failed: <command> in <directory>`, followed by its output. The output is
shown without terminal color codes, for every language.

A blocking report can also hold notes about lint and test commands that did not run.
They never block. Each has a rule id, shown here in brackets:

| Note | Meaning |
|---|---|
| `note: lint skipped in <dir>: no module root found, so it did not check these files` [`no-module`] | No Go module or Cargo crate around the changed files (TypeScript: `no package.json found`). |
| `note: tests not run in <dir>: no unit test or test script in package.json; not blocking` [`no-command`] | A TypeScript or JavaScript package has no test script the default runs. |
| `note: lint not run in <dir>: no type-check script, and no installed tsc with a tsconfig.json; not blocking` [`no-command`] | A TypeScript package has no type-check script, and no installed `tsc` or no `tsconfig.json` (also: a solution-style `tsconfig.json` none of whose references exists). |
| `note: lint not run in <dir>: no type-check script in package.json; not blocking` [`no-command`] | A JavaScript package has no type-check script (JavaScript has no `tsc` fallback). |
| `note: lint not run in <dir>: dependencies not installed (no node_modules holds them); not blocking` [`not-installed`] | A TypeScript or JavaScript package's dependencies are not installed; the same note exists for `tests`. |
| `note: lint not run in <dir>: Yarn Plug'n'Play (dependencies not in node_modules): default commands cannot run; not blocking` [`plug-and-play`] | The package uses Yarn Plug'n'Play; the same note exists for `tests`. |
| `note: lint not run in <dir>: go is not installed; not blocking` [`tool-missing`] | The command failed only because a tool it runs is not installed: the shell could not find the first word of the command or of one of its `&&`, `||`, `;` or `|` parts (`go`, `cargo`, `golangci-lint`, `npm`), `env` could not find a script's interpreter (`node`), or cargo has no `clippy` (`clippy is not installed`). Any language, default or configured command; the same note exists for `tests`. |
| `note: tests left to the main conversation's stop in <dir>; not blocking` [`main-stop`] | At a subagent's hand-back, the changed files' settings say `run_at = "main-stop"`, so the stage did not run for them; a later main conversation's stop runs it (limits in [configuration.md](configuration.md#when-a-stage-runs)). One note per folder; the same note exists for `lint`. Complexity still runs. |

The notes give the agent no remedy, since only you can change the commands. To check
such a package, install its dependencies or set its commands: see
[configuration.md](configuration.md#typescript). For a missing tool, install it (Rust's
clippy: `rustup component add clippy`) or set the stage's command: see
[configuration.md](configuration.md#when-a-tool-is-not-installed).

## When the turn ends

You get one status line.

| Status line | Meaning |
|---|---|
| `Ariadne ✓ lint passed · 6 functions within limits · tests passed` | Everything passed. |
| `Ariadne: no supported source files changed this turn` | Nothing to check (no Go, Rust, TypeScript or JavaScript file changed). |
| `Ariadne ✓ only comments changed · lint, complexity and tests skipped` | Every changed Go, Rust, TypeScript or JavaScript file differs only in its comments or whitespace, each line of code where it was, so nothing ran (see [how-it-works.md](how-it-works.md#edits-that-only-change-comments)). When some files changed only comments and others did not, the others are checked as usual and the status says nothing about the comment-only ones. |
| `Ariadne ✗ the turn ended with checks still failing after 5 rounds: ... · carried into the next turn` | The agent used every round and something still fails. After the colon: what fails. Complexity problems are kept as **complexity debt** (below). |
| `Ariadne ✓ lint and tests deferred, 1 subagent still running (general-purpose)` | Subagents are still working. Only the complexity of the main conversation's own files was checked; lint and tests run when the subagents finish. |
| `Ariadne ✓ no changes of yours, 1 subagent still running (...)` | The main conversation changed nothing itself; subagents are still working. |

Parts you may see inside a status line:

- `lint not run` / `tests not run`: no command ran for that stage (turned off, no Go
  module or Cargo crate around the changed files, no TypeScript or JavaScript package that could run
  its default command: no script for it, or dependencies not installed, or a tool the
  command runs is not installed). The reason shows
  only in a blocking report, as a note (above).
- `lint passed, 2 files not covered`: the command passed, but 2 changed files were not
  in any module or crate it ran on.
- `· ✗ not yours: ...`: these failures are in files another agent changed. They are
  listed so you know, but they did not block this agent.

If a turn ends with **no** `Ariadne` line at all, the plugin did not run. See
[install.md](../README.md#troubleshooting).

## Complexity debt

When a turn ends with functions still over the limit, those files go into a debt record
for the repository. From then on, in any session, the agent is held to them: rewriting
the same complex code is blocked, and every turn checks them again until they pass.
Committing the code or starting a new session does not clear it. To accept code that
is over the limit, change `.ariadne.toml` (raise a limit or add an exemption). To drop
debt that is not the agent's to fix, use `/ariadne:clear-debt`: it lists the files and
asks you to confirm first.

Code a Bash command brings in from commits the agent did not make (a merge, a pull, a
checkout, a rebase) is not checked as the agent's work, so it does not become debt.

Related notes:

| Note | Meaning |
|---|---|
| `Ariadne: the complexity debt in <file> is being fixed by another session` | Another Claude session is already working on that file, so this one is not blocked by it. |
| `Ariadne: the saved copy of <file> could not be read, so the whole file is judged as its complexity debt` | Ariadne lost the "before" version of the file, so it checks every function in it. |
| `Ariadne: the complexity debt record was corrupt; it was kept aside as record.corrupt-1.json and a new one started` | The record file was damaged. The old one is kept next to it for you to look at. |

More detail: [how-it-works.md](how-it-works.md#complexity-debt).

## Subagents

A subagent is checked the same way when it hands its work back. It is blocked only by
its own changes. When it is allowed through, its message to the main conversation ends
with Ariadne's status line, for example:

```
Ariadne ✓ lint passed · 21 functions within limits · tests passed
```

When a lint or test command fails after checking a file another agent also changed
(for Go's default commands, a file in one of the packages it ran), and its output names
none of the subagent's own files (see [how-it-works.md](how-it-works.md#subagents)),
the subagent is let through and the status line says the failure is someone else's:

```
Ariadne ✓ lint passed · 3 functions within limits · tests failed, not yours, 1 file not covered · ✗ not yours: tests failed: go test '.' in . (TestMean)
```

`tests failed, not yours` means every test command that ran failed this way (when some
passed, the summary says `tests passed` with the files not covered). After `✗ not yours:`
comes each such command (for Go, the packages it checked are in it: `go test './pkg/a'`),
the folder it ran in and, for tests, the first failing test. If the
subagent is blocked for something else, the same failures end its report on a line
starting `Ariadne: not yours, left to whoever changed them:`.

If the subagent uses all its rounds and something still fails, it is let through anyway,
and you also see one line yourself:

```
Ariadne ✗ subagent general-purpose ended with checks still failing after 5 rounds: ...
```

After the colon: what still fails (the same text the main conversation gets). The name
after `subagent` is the subagent's type; it is left out when Claude Code does not send
one. A passing hand-back shows you nothing. What to do: look at the subagent's work (the
listed functions, the failing command). You do not need to re-run anything: the main
conversation's own end-of-turn check still judges every change the subagent made in your
working tree (a subagent working in its own git worktree is judged once its changes are
brought back).

## Other messages

| Message | Meaning |
|---|---|
| `Ariadne config changes must be made by a human.` | The agent tried to edit `.ariadne.toml`. Only you may change the limits. |
| `Ariadne: hook failed: <reason>` | Something went wrong inside Ariadne (a git error, a file it could not read). It never blocks the agent. If it keeps happening, the reason says where to look. |
| `Ariadne: tests timed out after 600s: go test ./...; a timed-out stage never blocks` | Lint or tests took longer than their timeout. Raise `timeout_seconds` in `.ariadne.toml` if your build is slow. |
| `Ariadne: lint timeout ... exceed the Stop hook timeout ...` | Your lint and test timeouts together are longer than Claude Code waits for the hook. Lower them. |
| `Ariadne: could not read directory <dir>; changes inside it were not checked` | A folder could not be opened (permissions). |
| `note: <file> could not be fully parsed; only the functions that parsed were checked` | The file has a syntax error. Ariadne checked what it could. In TypeScript and JavaScript this never blocks; see [how-it-works.md](how-it-works.md#files-with-syntax-errors). |
| `7 repositories here, limit 5: their Bash edits were not checked` | You started Claude Code in a folder holding many repositories. See [how-it-works.md](how-it-works.md#a-folder-with-several-repositories). |
