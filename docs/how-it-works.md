# How it works

## A turn

A turn starts when you send a prompt and ends when the agent stops.

1. **When you send a prompt**, Ariadne records how the code looks now (the baseline).
   Only changes made after this point are the agent's.
2. **After each edit** (Write, Edit, or a Bash command that changed source files),
   Ariadne checks the functions that changed against the baseline. A function over its
   limit blocks that edit with a report.
3. **When the agent tries to stop**, Ariadne runs three checks on what changed in the
   turn: lint, complexity, then tests. If any fails, the agent is sent back with one
   report listing every failure.

Only functions that changed are judged. Old complex code that the agent did not touch
does not block it (unless it is complexity debt, below).

### Files with syntax errors

A changed file with a syntax error is judged where it parsed: the functions Ariadne could
read are checked as usual. After an edit, the syntax error itself is only a note. When
the agent tries to stop, a Go or Rust file with a syntax error blocks unless the lint
stage ran on it and passed (the compiler then accepts the file, so the error is
Ariadne's parser's, not the code's).

In TypeScript a syntax error never blocks, at an edit or at the stop: the parser
Ariadne uses rejects some valid, compiling TypeScript (such as
`importOriginal<typeof import("x")>()` or `export type * from "x"`, in about 0.2 to 0.6%
of files). It is only the note `<file> could not be fully parsed; only the functions that
parsed were checked`, and the functions that parsed are still judged and can block.
The same holds for JavaScript, where a Flow-typed file (`// @flow`) is the usual cause,
and for Java, where the parser does not know a few valid shapes (an annotated varargs
type, Java 25 statements before `this(…)` in a constructor; about 0.15% of files).

### Edits that only change comments

A file whose code did not change, only its comments or whitespace, is left out: the
edit is not judged, and at the stop lint, complexity and tests skip it. If that is true
of every changed file, nothing runs and the status says
`Ariadne ✓ only comments changed · lint, complexity and tests skipped` (also when only
whitespace changed, every line of code where it was).

"Only comments" is strict. Ariadne parses the old and new file and compares their code
tokens, each with its line. A comment reworded in place, or added at the end of a line,
changes nothing. A comment added or removed on a line of its own moves the code below
it to other lines, so the file counts as changed: tests that print line numbers or
compare them (`line!()`, `runtime.Caller`, snapshots) still run. A file that does not
parse, a new or deleted file, and any file in another language count as changed.

Some comments are code, because tools read them, so changing one counts as a change:

- **Rust:** doc comments (`///`, `//!`, `/** */`, `/*! */`), which doctests,
  `missing_docs` and clippy read. `////` and `/***` are plain comments, as in rustc.
  Also `// SAFETY:` comments, which clippy's `undocumented_unsafe_blocks` reads.
- **Go:** `//go:` directives (`//go:build`, `//go:embed`, `//go:generate`, …),
  `// +build`, `//line`, `/*line`, `//export`, `//nolint` and `// nolint`,
  `//lint:ignore`, `// #nosec` and `//#nosec` (gosec), `// Deprecated:`, and the
  `// Code generated ` header (linters skip generated files). In a file that imports `"C"` (the cgo preamble is a comment) and in
  a file with an example's `// Output:` or `// Unordered output:` (the lines after it
  are the expected output), every comment is code.
- **TypeScript:** comments the compiler, linters, formatters, coverage tools and
  bundlers read: `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`, `@ts-check`;
  `/// <reference` and `/// <amd-module`; `eslint-disable` (every variant, such as
  `eslint-disable-next-line`) and `eslint-enable`; oxlint's `oxlint-disable` and
  `oxlint-enable`; Biome's `biome-ignore` (also `-all`, `-start` and `-end`); the
  block comments `/* eslint `,
  `/* eslint-env `, `/* global ` and `/* globals `; the JSX pragmas `@jsx`,
  `@jsxImportSource`, `@jsxRuntime` and `@jsxFrag`; `prettier-ignore`;
  `istanbul ignore`, `c8 ignore` and `v8 ignore`; `#__PURE__` and `@__PURE__`;
  `@vite-ignore`; the test environment docblocks `@jest-environment` and
  `@vitest-environment`; and every webpack magic comment (a comment whose text starts
  with `webpack`, such as `webpackChunkName` or `webpackPrefetch`). The block comments,
  `///` and webpack's must start the comment; the others count with or without a space
  after `//` or `/*`, after the extra `*` of `/**`, and on any line of a block comment,
  so a pragma inside a JSDoc block counts too. Other JSDoc, including type annotations
  such as `/** @type {X} */` and `@param {T}`, is a plain comment: in a TypeScript file
  it does not change type checking. So is `@deprecated`. A `.tsx` file is read as TSX,
  so a comment reworded inside JSX (`{/* … */}`) is skipped like any other.
- **JavaScript:** the TypeScript list, plus JSDoc blocks (`/** … */`) that carry types
  (`@type`, `@typedef`, `@param {string}`, `@returns {number}` and the others listed in
  [languages.md](languages.md#javascript--tree-sitter-javascript-0250)): `tsc` reads
  them in JavaScript, so changing one runs lint and tests.
- **Java:** a comment holding `NOPMD`, `NOSONAR`, `CHECKSTYLE:`, `checkstyle:`,
  `@formatter:` or `spotless:`, which lint and format tools read. Javadoc is plain.

Complexity debt (below) is judged as always, comments or not.

Limits of this skip (CI still runs everything):

- Only source files Ariadne analyzes are compared. If the same turn also changed
  `go.mod`, `Cargo.toml`, `package.json` or test data, and every source file changed
  only in comments, lint and tests are skipped (as when only those files change).
- A lint command that also checks formatting (`cargo fmt --check`, `gofmt -l`,
  `prettier --check`) does not run again for a comment reworded in place, so a badly formatted comment is not
  caught during the session.
- Only lines are compared, not columns. A block comment reworded before code on the
  same line moves that code sideways, which can change `column!()`, the `line:col` of
  a panic message and the columns in trybuild or compiletest `.stderr` files, without
  a run.
- Other comments that tools read are plain: analysistest's `// want`, compiletest's
  `//~` and `//@` annotations, and in TypeScript `@deprecated`, which some lint rules
  read (typescript-eslint's `no-deprecated`); Ariadne treats TypeScript lint as type
  checking, which ignores it.
- tree-sitter splits code into tokens as the compiler does, except in crafted cases:
  removing a `/**/` from between two operator characters (`a </**/-b` to `a <-b`) can
  look like a comment-only change.

"Complexity" on this page means all five scores of [checks.md](checks.md): cyclomatic,
cognitive, length, parameters and nesting. They are judged together: any score over its
limit blocks, goes into the same report and the same debt, and follows the same
`[hooks] mode`.

## Rounds

Each time the stop is blocked, the agent spends a round. It has 5 rounds by default
(`[hooks] max_stop_iterations`). Every report ends with `Ariadne: round N of M`. On the
last round the agent is told that complexity limits are not optional; only a lint or test
problem it cannot fix itself (a missing tool, a broken environment) may be left.

A lint or test command that fails only because its tool is not installed (no `go`, no
clippy, a configured `golangci-lint` that is missing) spends no round: its stage gets a
note instead and its files are not covered (see
[configuration.md](configuration.md#when-a-tool-is-not-installed)).

When the rounds run out, the turn ends anyway. Lint and test failures are reported to
you. Complexity problems become debt.

## Complexity debt

A function left over the limit is not forgotten. The files Ariadne blocked on for
complexity go into a **debt record** for the repository, together with a copy of each
file from before the turn that made it fail.

From then on, every turn, in this session or any other, checks those files again
against that copy, even when the agent did not touch them. Writing the same complex code
again is blocked as soon as it is written.

A file leaves the record only when:

- its functions are back within the limits;
- it is restored to the saved copy, or deleted;
- you change `.ariadne.toml` so it passes (higher limit, exemption, exclusion).

A commit does not clear it, and neither does a new session. To drop all the debt of a
repository or worktree, use `/ariadne:clear-debt` (see
[Clearing the debt](#clearing-the-debt-ariadne-debt-clear)).

**Several sessions.** When a session is blocked on a debt file, it claims that file, so
two sessions do not rewrite it at the same time. Other sessions then see
`the complexity debt in <file> is being fixed by another session` and are not blocked by
it. A claim ends when the file passes, when the claiming turn ends, or after 30 minutes.

## Subagents

A subagent is checked when it hands its work back, against the code as it was when the
subagent started. It is blocked only by its own changes, with its own rounds. If it uses
them all and something still fails, it is let through and you see one line saying so
(see [messages.md](messages.md#subagents)). Failures in
files someone else changed are listed as `✗ not yours` and do not block it.

Lint and tests run at a hand-back too, unless their `run_at` is `"main-stop"`: then a
hand-back skips them with a note, and a later main conversation's stop runs them.
Complexity always runs at a hand-back. See
[configuration.md](configuration.md#when-a-stage-runs).

Lint and tests run once per command scope: a Go module (in its root folder), a Rust
crate, a TypeScript package. Two subagents whose changes the same command run checks
share one result. A command that names the changed packages (`go vet {packages}`, the
Go default) checks only those packages, so another agent's change counts only when it is
in one of them; a command without `{packages}` (`go test ./...`, `cargo test`,
`npm test`) checks the whole scope, so any other change in it counts. When someone else
changed a file that a failing lint or test command checked, Ariadne reads the last 80
lines of the command's output for file names:

- If it names one of the subagent's own changed files (`./geometry.go:3:2`,
  `src/table.tsx(3,1)`, an absolute path), the failure blocks the subagent as usual.
- If it names an unchanged test file of one of the subagent's own changed sources, the
  failure also blocks: Go `geometry_test.go` tests `geometry.go`; TypeScript
  `form.test.tsx`, `form.spec.ts` and `__tests__/form.ts` test `form.ts`, `.tsx`, `.mts`
  or `.cts` beside them. Rust has no such pairing (its unit tests live in the source
  file).
- Otherwise the failure is listed as `✗ not yours` with the command and where it ran.
  The subagent is not blocked, no round is spent, and its files there count as not
  checked.

What follows from this rule:

- A subagent whose change breaks another agent's changed file (`stats.go:5: undefined:
  Area`, or tsc's error in the other agent's importing file) is warned, and the other
  agent is blocked for it.
- A failure named only in unchanged files that are not tests of a changed source (an
  unchanged caller, a Rust `tests/x.rs`), or in no file at all, is a warning for every
  subagent sharing the run.
- A failure whose only mention of the subagent's file falls before the last 80 lines is
  a warning too.
- In every such case the main conversation's stop, once no subagent runs, answers for
  every change and blocks on the failure.

Lines that only report progress or a passing file never count as naming one: Jest's
`PASS src/table.test.tsx` and Vitest's `✓ src/table.test.tsx`, cargo's `Running
unittests src/lib.rs` and `Doc-tests m`, and `go test`'s `ok  example.com/m` line.

A file counts as named when its path from the scope's folder or from the repository root
appears whole: after the start of a line, a space, a quote (`"`, `'` or a backtick), `(`,
`)`, `,` or `/`, and before `:`, `(`, `)`, `,`, a quote, a space or the end of the line.
So `stats.go` is not named by `mystats.go` or `stats.go.bak`. A bare file name also
counts (`go test` prints `stats_test.go:9` for a test in `pkg/stats/`), but only when no
other changed file the run checked, and no source such a file tests, has the same name:
with `pkg/a/util.go` and `pkg/b/util.go` both changed and checked by one `go test ./...`,
`util.go:3` names neither, and only `pkg/a/util.go:3` names the first. A subagent whose
failing command checked no one else's change (alone in the packages it ran, or in its own
worktree) is blocked by any failure, as before.

While subagents are still running, the main conversation's stop checks only the
complexity of its own files. Lint and tests wait until the subagents finish, because
their half-written code could break the build. Once they finish, the main conversation's
stop checks everything again, so nothing a subagent left behind is missed.

### Subagents in git worktrees

A subagent started with `isolation: "worktree"` works in its own copy of the repository
(a linked worktree in `.claude/worktrees/`). Ariadne checks that subagent inside its
worktree: its edits, its Bash commands and its commits there. If the worktree is removed
before the subagent hands back, the commits on its branch are still checked for
complexity.

The worktree is made from the last commit, so the subagent is checked with the
`.ariadne.toml` committed there. A change you have not committed, or a file git ignores,
does not reach it: it uses the committed version, or the defaults when there is none.
Commit `.ariadne.toml` to give your subagents your settings.

Settings are fixed when a run starts. Ariadne reads `.ariadne.toml` as it was when you
sent the prompt (for a subagent, when it started). A change takes effect from your next
message, or from a subagent's next run.

With `run_at = "main-stop"`, the main conversation's stop tests a worktree subagent's
files while the worktree exists, or once its branch is merged into the main checkout. A
worktree removed before then, with its branch never merged there, is not tested by
Ariadne (a known limit).

## Bash edits

A Bash command that changes source files (a `sed`, a script, a code generator) is
checked right after it runs, like a Write. Two exceptions:

- a file another agent wrote with Write or Edit while the command ran is left to that
  agent;
- a command that changes more than 50 source files is not checked right away; the
  end-of-turn check covers it.

A file that changes while an agent's Bash command runs counts as that agent's, whoever
changed it.

**Merges, pulls and checkouts.** Code a Bash command brings in from commits that
existed before it ran, and that the agent did not make, is not the agent's work: a
`git merge` or `git pull` (the other branch's commits), a `git checkout` or `git switch` of another branch, a `git reset` to
another commit, a `git rebase` onto another branch, and a merge or cherry-pick stopped by
a conflict. A file that ends up exactly as in one of those commits is not checked, and in
any other file a function that is the same as in one of them is not checked either, right
after the command and at the end of the turn. So that code never becomes debt. What the
agent writes on top, including how it resolves a conflict, is checked as usual.

The same holds for a merge, pull or checkout you run yourself, in your own terminal,
between two prompts of a turn that did not finish (you pressed Esc, so the next prompt
carries on from where the turn started). A commit you make yourself in between, a merge
commit included, may hold the agent's unfinished work, so what it adds is still checked
as the agent's; what a merge brings in from the other branch is not.

## A folder with several repositories

If you start Claude Code in a folder that is not a git repository but contains some,
Ariadne finds repositories up to two levels down (it skips hidden folders,
`node_modules`, `target` and `vendor`). Each one is checked as if the session had
started inside it. With more than `[hooks] max_workspace_repos` (default 5), Bash edits
in them are not checked, and the status line says so.

## Seeing the state: `ariadne status`

`ariadne status` (or `/ariadne:status` in Claude Code) prints what the hooks last
recorded for the current folder's repository, or for the folder itself outside git:

```
Ariadne session 4f1c…
  Rounds used: 2 of 5
  Blocking:
    complexity ✗ 1 function over the limits — main.go:5 run
  Subagents running: 1 (a1)

Complexity debt (files left over the limits):
  old/legacy.go (being fixed by session 4f1c…)
```

- **Blocking:** one line per check that failed at the turn's last blocked stop, as the
  report's summary gave it. `Blocking: nothing` means no stop has blocked this turn.
- **Rounds used:** the rounds spent this turn, of `[hooks] max_stop_iterations` from the
  folder's `.ariadne.toml` as it is now.
- **Subagents running:** the agent ids of the session's subagent runs whose entry
  changed within the last 24 hours. `No turn in progress.` means the main conversation's
  last turn ended while those runs go on.
- **Complexity debt:** the debt files still on disk, with the session whose claim says it
  is fixing one.

With several sessions, each is listed, newest first (by when its state was last saved).
A turn that passed its stop leaves no state, so a quiet repository prints
`No Ariadne session has run here yet.` (or only its debt). Outside git, the folder store
is shared by every folder, so only the sessions and debt that name a file in the
current folder are shown; a session that has not yet touched a file there is not.
It only reads: no lock is taken, nothing is pruned, nothing is written.

## Clearing the debt: `ariadne debt clear`

`/ariadne:clear-debt` in Claude Code first shows what is recorded and asks you to
confirm:

```
Complexity debt recorded here (files left over the limits):
  a.go
  b/c.go

Clearing it removes these files from the record, and the saved copies they are judged against.
Ariadne then judges them like any other file: only the code a turn changes.
This cannot be undone.
```

Only if you answer yes does it clear the debt, and it prints one line such as
`Cleared the complexity debt of 2 files.`

From the command line, `ariadne debt clear --dry-run` prints the same list and writes
nothing; `ariadne debt clear` clears without asking.

- In a git repository it removes the whole debt record and its saved copies. A linked
  worktree has its own record, so clearing there leaves the main checkout's alone.
- Outside git, every folder shares one record, so only the current folder's files are
  removed from it.
- Use it when the debt is not the agent's to fix, for example code that came in with a
  merge before Ariadne told merged code apart (see
  [Merges, pulls and checkouts](#bash-edits)).

## Where Ariadne keeps its files

Ariadne's checks never write into your project's files, so there is nothing to add to
`.gitignore`. Only `/ariadne:init` writes one, `.ariadne.toml`, and only after you say
yes.

| Where | What | When |
|---|---|---|
| `.git/ariadne/` | `sessions/` (each turn's state) and `debt/` (the complexity debt record) | A session inside a git repository. A linked worktree uses its own git folder: `.git/worktrees/<name>/ariadne/`. |
| Claude Code's plugin data folder, or `ariadne/` in the system temp folder | The same `sessions/` and `debt/` | A session started in a folder that is not a git repository. |
| The system temp folder | Short-lived scratch files | Removed when each check finishes. |

`.git/` is never committed, so none of this shows up in `git status`.

Each subagent run keeps its own small entry in `sessions/`. When you send a prompt,
Ariadne removes the entries of subagent runs untouched for 24 hours. Your sessions'
own entries are kept, so a session resumed days later still finds its state.

Two related things are not Ariadne's:

- `.claude/worktrees/` is where Claude Code puts subagents that run with
  `isolation: "worktree"`. Add it to `.gitignore`, or `git status` lists each worktree as
  an untracked folder.
- `.ariadne.toml` is your configuration (`/ariadne:init` writes it from your answers).
  Commit it, and do not git-ignore it: subagents in git worktrees only see the committed
  file (see [Subagents in git worktrees](#subagents-in-git-worktrees)).

To clear only the complexity debt, use `/ariadne:clear-debt`. To reset Ariadne in a
repository (all turn state and all complexity debt), close the Claude Code sessions
working there and delete `.git/ariadne/`.

## Known limits

- Only Go, Rust, TypeScript, JavaScript and Java are analyzed. Kotlin is planned.
- Only macOS and Linux, on x86_64 and aarch64.
- Git 2.30 or newer is required.
- A Bash command can edit `.ariadne.toml`; Ariadne blocks only Write and Edit. The change
  takes effect on the next turn. Use `CODEOWNERS` in review to catch it.
- Untracked files over 4 MiB are not part of the baseline, so they are not checked
  during a session until they are tracked. CI still checks them.
- Bash edits are not seen inside submodules or a repository nested in another one.
  Write and Edit there are checked.
- A file renamed with Bash (`git mv a.go b.go`) is checked as a new file, so every
  function in it over the limits blocks.
- Files you edit yourself between two prompts of an unfinished turn, without committing,
  are checked as the agent's.
- The agent's own commits are the ones a Bash command made while it ran, told by their
  commit date. So a commit dated in the past on purpose passes as someone else's code,
  and so does a commit the agent made without moving `HEAD` in the checked folder (in
  another worktree, or with git's low-level commands). A cherry-pick or a `git merge
  --squash` that completes without a conflict makes a new commit, so the code it brings
  in is checked as the agent's. So is old code brought back without moving `HEAD`
  (`git revert`, `git restore --source=<branch>`, `git checkout <branch> -- <file>`), and
  a function both branches changed that git merges without a conflict.
- Files outside the session's repository that the agent edits with Write or Edit are
  checked against that repository's last commit, so your own uncommitted changes there
  can count against the agent.
- A subagent's Bash edits to the main checkout, made from inside its worktree, are only
  caught at the main conversation's next stop.
- Lint and test commands run with `CI=true`.
- A lint command that also checks formatting (`cargo fmt --check`, `gofmt -l`) is not
  run again when only comments changed in place, so a badly formatted comment is caught
  by CI, not during the session. Columns are not compared either: a comment-only edit
  that moves code sideways on its line (`column!()`, a panic's `line:col`, trybuild
  `.stderr` columns) runs nothing; nor do edits to `// want`, `//~` or `//@` test
  annotations, to the TypeScript comments that are plain but read by a tool
  (`@deprecated`), or a crafted removal of `/**/` between two operator characters (see
  [Edits that only change comments](#edits-that-only-change-comments)).
- A workspace-wide cargo command (`--workspace` or `--all`) runs once in the workspace
  folder, so a `.cargo/config.toml` or `rust-toolchain.toml` inside a member crate's
  folder is not applied to that run.
- TypeScript and JavaScript tests run per package, the whole package's suite (no narrowing to the
  changed files); a change in a shared package runs only that package's tests, not those
  of the apps that use it. A `test` script that itself calls `pnpm -r` or `--filter`
  needs pnpm installed; set `[languages.typescript.tests]` in that case. See
  [configuration.md](configuration.md#typescript).
- TypeScript default commands are worked out for each package when lint and tests run,
  from its scripts, `tsconfig.json` and `node_modules` at that moment, so packages in one
  turn can run different commands. A package whose dependencies are not installed runs
  nothing, with a note; Ariadne never installs them. See
  [languages.md](languages.md#lint-and-test-commands).
- In TypeScript and JavaScript, some code is never judged: a top-level IIFE, the setup code directly
  inside a `describe` (outside its `it`s and hooks) and functions inside a decorator's
  arguments. Callback names (`it("adds")`, `router.get`) are worked out from the call's
  text. See [languages.md](languages.md#typescript--tree-sitter-typescript-0232).
- Rust test code kept in its own file through `#![cfg(test)]` or an out-of-line
  `mod tests;`, and tests marked only `#[rstest]` or similar outside a `#[cfg(test)]`
  module or `tests/` folder, get the normal limits, not the test ones.

