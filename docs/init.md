# Setting up a project

In Claude Code, in your project (or an empty folder for a new one), run:

```
/ariadne:init
```

That is all you need. The rest of this page explains what it does; the last part,
[Under the hood](#under-the-hood-for-scripts), is only for people who script setup
without Claude.

## What it asks

1. **Git.** When the folder is not a git repository, whether to create one. When it is
   inside one, whether to set up that repository instead.
2. **Languages.** Which languages the project uses: Go, TypeScript, JavaScript, Rust. You can pick
   several, also ones with no files yet. The ones it finds are already ticked.
3. **Defaults or your own.** For each language you picked, whether to use Ariadne's
   defaults. If you want your own, it asks for each lint and test command (the default,
   your own command, only at the main conversation's stop, or off) and for the limits.
4. **Missing tools.** For each tool that is not installed (clippy, a TypeScript or
   JavaScript package's `node_modules`), it shows the install command and the folder, and runs it
   only if you say yes.
5. **The file.** It shows `.ariadne.toml` and what changes, and writes it only if you
   say yes.

## What it writes

- **`.ariadne.toml`, with every setting of every language you picked:** your answers,
  and the rest at their defaults. Each setting has a comment saying what it does and its
  default. To change something later, edit the file; you do not need to run
  `/ariadne:init` again.
- **If the file already exists**, everything it sets stays as it is, comments
  included. Only missing settings are added, and you see them in the diff first. A
  value you change in the questions is changed only after you confirm it.
- **A new git repository**, only when you said yes to the first question.

Nothing else: it never edits `.gitignore` or any other file, never installs anything
you did not say yes to, and never commits. When it is done, it reminds you to commit
`.ariadne.toml`, because subagents working in git worktrees only see the committed
file.

A language you did not pick, but that the folder has files of, stops being checked:
its files go into `[hooks] exclude_extra`. To check it again, delete that line.

## Under the hood (for scripts)

`/ariadne:init` runs two command-line steps, which you can also run yourself, for
example to set projects up from a script:

```
ariadne init --plan [--format human|json]     # what it finds and would ask; writes nothing
ariadne init --apply ANSWERS.json [--dry-run]  # writes the answers to .ariadne.toml
```

### How `/ariadne:init` uses them

The plugin command `/ariadne:init` (`plugin/commands/init.md`) runs these two steps for
you in Claude Code. It calls the plugin's own binary, `${CLAUDE_PLUGIN_ROOT}/bin/ariadne`,
so `ariadne` does not need to be on your `PATH`. In order, it:

1. runs `ariadne init --plan --format json`;
2. when the folder is inside a repository, asks whether to set up that repository
   instead, and if you say yes, makes the plan again at its root;
3. asks which languages the project uses: every language Ariadne checks, the ones found
   ticked, also ones with no files yet;
4. for each language picked, asks whether to use Ariadne's defaults. For a language
   where you want your own values, it asks the stage questions (each shows its command)
   and the limits question. You can type your own command or numbers;
5. for each missing tool, shows the install command and the folder, and runs it only if
   you say yes, one at a time. If an install fails, or you say no, the stages that need
   the tool are skipped with a note at each stop, and never block;
6. writes your answers to a new file in the system temp folder (never in the project).
   An answer that changes a value your `.ariadne.toml` sets is marked confirmed, after
   it asks you;
7. runs `ariadne init --apply <answers> --dry-run` and shows the changes, the file and
   the diff;
8. on your yes, runs `ariadne init --apply <answers>` and shows its output, with the
   commit hint;
9. runs `ariadne init --plan` again to show the new state.

The file it writes holds every setting of each language picked, so later changes are
made by editing the file, not by running `/ariadne:init` again. It never edits
`.ariadne.toml` itself, never edits `.gitignore`, and never commits.
The rules that protect your project are in the binary, not in the command.

### `ariadne init --plan`

`ariadne init --plan` looks at the current folder and prints:

- the repository state;
- the languages it finds, and where;
- the lint and test commands the Stop gate would run, and where;
- whether the tools those commands need are installed;
- the folder's own `.ariadne.toml`;
- the setup questions, each with its default answer.

It writes nothing. The only processes it starts are git (to find the repository, and to
ask whether `.ariadne.toml` is tracked or ignored) and, for Rust, `cargo clippy
--version` once (10 seconds at most), with `RUSTUP_AUTO_INSTALL=0` so rustup never
installs a toolchain. Apart from that one `cargo clippy --version`, it runs no go, cargo or npm commands.

`--format human` (the default) is short text for people. `--format json` is for the
`/ariadne:init` command and for scripts; its schema is below.

### What it finds

- **Repository:**
  - the folder is a repository root;
  - it is inside a repository (the root is shown relative, e.g. `..`);
  - it is a *workspace parent*: in no repository, but repositories sit at most two
    levels below it (found as the hooks' workspace mode finds them);
  - it is not a repository.
- **Languages and places.** The plan looks only at the files the Stop gate would see:
  - in a repository, the files git does not ignore below the folder
    (`git ls-files -co --exclude-standard`, which does not write the index): tracked
    files, and untracked files no ignore rule matches;
  - in a workspace parent, the same for each repository below it;
  - outside git, the files `ariadne check .` walks.

  Excludes apply in every case. The plan groups the files the way the Stop gate does:
  by language, by stage settings and by repository. Each group is then split into the
  gate's command scopes:
  - a Go module (`go.mod`);
  - a Rust crate (`Cargo.toml`);
  - a TypeScript or JavaScript package (`package.json`).

  A Go module with a `web/` folder therefore shows Go at `.` and TypeScript at `web`.
  A command that checks a whole workspace from anywhere (`cargo clippy --workspace`,
  with no `{packages}`) shows once, at the workspace root, where the gate runs it.
  Files outside every module root show at their shared folder. Their stages show as
  `skipped` ("no module root found"; for TypeScript and JavaScript, "no package.json found").
- **Stages.** Each language has a lint and a tests stage per place. For each one the
  plan shows:
  - the command the gate would run there, before `{packages}` is filled in: the
    configuration's command, or the language's default (TypeScript's default is worked
    out for each package);
  - or `off` (`command = ""`);
  - or `skipped`, with the gate's reason (no module root, no script, dependencies not
    installed).
- **Tools.** For each command that runs, the plan looks up the first word of each shell
  command in it (split at `;`, `&` and `|`; `NAME=value` words and shell builtins such
  as `cd` are skipped):
  - a plain word is looked up on `PATH`, without running it;
  - a word with a `/` is looked for relative to the place;
  - the language's subcommand tools are probed: `cargo clippy` needs clippy, and
    `cargo clippy --version` runs once, with `RUSTUP_AUTO_INSTALL=0`. clippy is:
    - `found` if the probe succeeds;
    - `unknown` if it says the project's toolchain (from `rust-toolchain.toml`) is not
      installed. The reason names the toolchain, and `install` holds `rustup toolchain
      install <name>` for the user to run. No install question is asked for it;
    - `missing` if it fails any other way;
    - `unknown` if it times out or cargo is missing;
  - a TypeScript package whose dependencies are not installed needs `node_modules` in
    that place.

  The install command comes from the language when it knows one:
  - `rustup component add clippy`;
  - for a TypeScript package, the package manager of the nearest lockfile, searched
    from the package up to the repository root, run in the folder holding it:

    | lockfile | command |
    |---|---|
    | `pnpm-lock.yaml` | `pnpm install` |
    | `yarn.lock` | `yarn install` |
    | `bun.lockb` or `bun.lock` | `bun install` |
    | `package-lock.json` | `npm install` |

    Without a lockfile it is `npm install` in the package. In a pnpm or Yarn workspace
    the lockfile sits at the root, so the install runs there, and the packages that
    share it get one install question.
- **`.ariadne.toml`.** The plan reads the folder's own file. It tells whether the file
  exists and whether it is valid, and gives the error on one line when it is not. Inside
  a repository it also tells:
  - whether git tracks the file;
  - whether an ignore rule matches it (`git check-ignore --no-index`), for an existing
    file or one not created yet. For a file git does not track, the human text then
    adds that subagents working in git worktrees will not see it (they start from the
    last commit) unless it is committed with `git add -f .ariadne.toml`. A tracked file
    is committed anyway; the rule has no effect on it.

  An invalid file stops detection: the plan shows the error and asks no questions.

### Questions

Each question is asked only when it applies, in this order:

| id | kind | when | default |
|---|---|---|---|
| `git.init` | `yes-no` | the folder is in no repository and is no workspace parent | `yes` |
| `git.use-parent` | `yes-no` | the folder is inside a parent repository | `yes` |
| `languages` | `languages` | always: it offers every language Ariadne checks (Go, TypeScript, JavaScript, Rust), also ones with no files yet | the languages found |
| `stage.<lang>.<stage>` | `stage` | for each language offered, `lint` then `tests` | the file's values, else the default command at `every-stop` |
| `limits` | `limits` | always | `custom` when the file sets a limit other than its built-in value, else `default` |
| `install.<tool>` or `install.<tool>:<place>` | `install` | a tool is missing and the language knows its install command (`<place>`: where to run it) | `yes` |

An empty folder gets the git question, the languages question with nothing ticked, and every
language's stage questions: a project can be set up before it has any files. `--apply`
writes every setting of each picked language, so the user edits the file by hand later
instead of running init again.

When the folder's `.ariadne.toml` sets a stage's `command` or `run_at`, the stage
question's `current` holds those values and its default is `current`. A language's
own section counts first; Go and Rust then also count the top-level `[lint]` and
`[tests]`, as the gate does. A `command` that spells the language's own default
(`go vet {packages}`) counts as `default`, and limits that are all the built-in values
count as `default` too, so a full file init wrote proposes the same defaults as no
file. So a re-run proposes what is already there.

### JSON schema (version 1)

Every path is relative to the folder and `/`-separated. Every list is sorted. The same
folder gives the same bytes. `schema` changes only with an incompatible change.

```jsonc
{
  "schema": 1,
  "repository": { "state": "repository-root" },
  // or { "state": "inside-repository", "root": ".." }
  // or { "state": "workspace-parent", "repositories": ["api", "web"] }
  // or { "state": "not-a-repository" }
  "languages": [
    { "language": "go", "name": "Go", "places": ["."] }
  ],
  "stages": [
    {
      "language": "go",            // [languages.<key>] key
      "stage": "lint",             // "lint" | "tests"
      "place": ".",
      "status": "runs",            // "runs" | "off" | "skipped"
      "source": "default",         // "default" | "config"
      "command": "go vet {packages}",   // null unless it runs
      "reason": null,              // why it is skipped
      "run_at": "every-stop",      // "every-stop" | "main-stop"
      "tools": ["go"]              // names in "tools"
    }
  ],
  "tools": [
    {
      "tool": "clippy",
      "place": null,               // set for a path or a package's node_modules
      "status": "missing",         // "found" | "missing" | "unknown"
      "reason": null,              // why, when it needs saying (toolchain not installed)
      "install": "rustup component add clippy",   // null when unknown
      "install_in": null,          // where to run "install"; null for anywhere
      "needed_by": [{ "language": "rust", "stage": "lint", "place": "." }]
    }
  ],
  "config": {
    "path": ".ariadne.toml",
    "exists": false,
    "error": null,                 // one line when the file cannot be used
    "tracked": false,              // null outside a repository
    "ignored": false               // null outside a repository
  },
  "questions": [
    { "id": "git.init", "text": "…", "kind": "yes-no", "default": "yes" },
    { "id": "languages", "text": "…", "kind": "languages",
      "options": ["go"], "default": ["go"] },
    { "id": "stage.go.tests", "text": "…", "kind": "stage",
      "language": "go", "stage": "tests",
      "commands": [{ "place": ".", "status": "runs",
                     "command": "go test {packages}", "reason": null }],
      "default": { "choice": "custom", "command": "make test", "run_at": "main-stop" },
      "current": { "choice": "custom", "command": "make test", "run_at": "main-stop" } },
    // choice: "default" | "custom" | "off"; command only for "custom"
    { "id": "limits", "text": "…", "kind": "limits", "default": "default",
      "defaults": { "thresholds": { "cyclomatic": 10, "cognitive": 15, "length": 80,
                                    "parameters": 7, "nesting": 4 },
                    "languages.go": { "cyclomatic": 15 },
                    "languages.typescript.tsx": { "length": 120 },
                    "test_code": { "length": 150 } },
      "current": null },
    { "id": "install.node_modules:.", "text": "…", "kind": "install",
      "command": "pnpm install", "place": ".", "default": "yes" }
    // one question per tool, command and folder: a workspace's packages share it;
    // "place" (and the id's ":<place>") is where to run the command
  ]
}
```

### `ariadne init --apply`

```
ariadne init --apply ANSWERS.json [--dry-run]
```

`--apply` writes the answers to the plan's questions into the folder's `.ariadne.toml`,
and runs `git init` when the answers say so. It first makes the plan again, so the
answers are checked against the folder as it is now.

It writes nothing else:

- no `.gitignore`: `.ariadne.toml` is a normal file the project commits. Subagents work
  in git worktrees made from the last commit, so a file that is not committed, or that
  an ignore rule hides, never reaches them;
- no project file (`package.json`, `go.mod`, sources);
- no install: an `install.*` answer for a tool a language knows how to install
  (`clippy`, `node_modules`) is accepted and ignored, even when the plan no longer
  asks it (the tool may have been installed since); installs are run by the
  `/ariadne:init` command, each after the user's yes;
- no project command, no lint, no tests.

`--dry-run` writes nothing. It prints the changes, the resulting `.ariadne.toml` and a
unified diff against the file as it is.

#### The answers file (schema 1)

A JSON object keyed by the plan's question ids, each given once. A question left out
keeps the file as it is.

```json
{
  "schema": 1,
  "answers": {
    "git.init": "yes",
    "languages": ["go", "typescript"],
    "stage.go.lint": { "choice": "default", "run_at": "every-stop" },
    "stage.go.tests": { "choice": "custom", "command": "make test",
                        "run_at": "main-stop", "confirmed": true,
                        "previous": { "choice": "custom", "command": "go test ./...",
                                      "run_at": "every-stop" } },
    "stage.typescript.tests": { "choice": "off" },
    "limits": { "choice": "custom", "values": { "thresholds": { "cyclomatic": 12 } } },
    "install.node_modules:web": "yes"
  }
}
```

| id | answer |
|---|---|
| `git.init`, `git.use-parent`, `install.…` | `"yes"` or `"no"` |
| `languages` | the language keys to check |
| `stage.<lang>.<stage>` | `choice` (`default`, `custom` or `off`); `command` with `custom` only, not empty; `run_at` (`every-stop` or `main-stop`; left out: unchanged); `confirmed` and `previous` (the question's `current` in the plan) |
| `limits` | `choice` (`default` or `custom`); `values` with `custom` only, by section (`thresholds`, `test_code`, `languages.<lang>`, `languages.typescript.tsx`) and key (`cyclomatic`, `cognitive`, `length`, `parameters`, `nesting`; left out: unchanged); `confirmed` and `previous` (the question's `current` in the plan) |

A stage question's `default` in the plan is already an answer in this shape. For the
limits question, the plan's `default` goes in `choice`. A stage answer for a language
the `languages` answer leaves out is ignored: that language's files are excluded.

#### What it writes

- **A full file.** After `--apply`, `.ariadne.toml` holds every setting you may
  change, at your answer or the built-in value, so you can open it and edit it by
  hand (see "The full file" below). A setting the file leaves out is filled in once,
  at its built-in value, and listed as a change (`Added hooks.mode = "changed".`, in a
  dry run too).
- **Only what differs.** An answer is written only when it differs from what the file
  says now (or, where the file leaves it unset, from the built-in value). So once the
  file is full, answering every question with the plan's own defaults changes nothing,
  and applying the same answers twice gives the same bytes.
- **Every other byte stays.** Comments, key order, spacing, `\r\n` line endings, a
  missing final newline and every table the answers do not name (`[[overrides]]`,
  `[languages.go.rules]`, …) are kept byte for byte. A changed value keeps the
  comments around it. A new key goes in its table in the order below (after the last
  key that comes before it, else before the first that comes after it); a new table
  goes the same way among the tables, under a comment. No key is ever removed. With
  nothing to change, the file is not touched at all. A file that cannot be kept byte
  for byte (mixed line endings, a byte-order mark) is not filled in; only an answer
  that changes it is refused.
- **Confirmation.** An answer that would change a value the file already sets needs
  `"confirmed": true` and `"previous"` on that answer: the question's `current` as the
  plan showed it to the user. Without them, `--apply` refuses and names the key, its
  value and the answer's. When the file no longer holds `previous` (it was edited
  after the plan, or the answers were made for another folder) and the answer would
  change it, the answer is stale (exit 3). An answer the file already holds changes
  nothing, whatever its `previous` says, so applying the same answers file again
  succeeds (exit 0, same bytes). A stage value set in the shared `[lint]` or `[tests]` counts too; the new
  value is then added to the language's own section (the change line says it
  overrides the shared key for that language), so other languages keep theirs.
- **Stages.** `custom` writes `command`; `off` writes `command = ""`; `default` writes
  the language's default command where the file sets another one. TypeScript's
  default is worked out per package and has no text to write, so `default` on a
  TypeScript stage whose `command` the file sets is refused: delete the `command` by
  hand. `run_at` is written when it differs.
- **Limits.** `custom` writes the given values. `default` writes the built-in value of
  each limit the file sets (for a key with no built-in value in its own section, the
  built-in value it falls back to: `[languages.typescript]` for `.tsx`, then
  `[thresholds]`).
- **Languages.** A language found but not in the answer is no longer checked: a glob
  for its sources (`**/*.{ts,tsx,mts,cts}`) is added to `[hooks] exclude_extra`, one
  change line per glob. Entries are only added there, never removed, so this needs no
  confirmation. To check the language again, delete its line from `exclude_extra` by
  hand (picking it again in `/ariadne:init` does not remove the line).
- **Safe writes.** The new text goes to a temporary file next to `.ariadne.toml`
  (`.ariadne.toml.tmp-<pid>-<n>`), which then replaces it in one rename, keeping its
  permissions (a new file gets the default ones); a failed or interrupted write leaves
  the old file whole, and the target is never created before the rename. A failed
  write removes its temporary file; a process killed mid-write can leave one behind,
  which is safe to delete. A link is written through: the file it
  points to is replaced and the link stays. Two cases are written in place instead: a
  file with another hard link (a rename would split them), and a writable file in a
  folder that takes no new file. A read-only file is refused.
- **A new file** starts with a header comment naming the date, above `version = 1`
  (the comment belongs to the first key, so later edits never move it).
- **`git init`** runs only when the plan asks `git.init`: the folder is in no
  repository and is no workspace parent. It runs last, after every check and after
  `.ariadne.toml` is written. When it fails, `--apply` says so (exit 2) and the file
  stays written.

After writing, `--apply` prints every change, and:

- `Commit .ariadne.toml so subagents working in git worktrees use it.` when the last
  commit does not hold the file as it now is (it is untracked or modified). It is
  read-only: `--apply` never commits. `--dry-run` prints it as `After writing: …`;
- when an ignore rule matches an untracked `.ariadne.toml`, a warning that worktree
  subagents will not see it, and the commit hint names `git add -f .ariadne.toml`.
  A tracked file is committed anyway, so it gets no warning. `.gitignore` is never
  edited.

#### The full file

In this order, each section under a comment saying what it holds and each key with a
comment saying what it does and its default (`length = 80  # lines per function;
default 80`):

- `version = 1`;
- with a language checked: `[thresholds]` (the five limits) and `[test_code]`
  (`length`); then for each language checked, `[languages.<lang>]` with its own
  built-in limits (Go: `cyclomatic = 15`; TypeScript also `[languages.typescript.tsx]`
  `length = 120`, JavaScript `[languages.javascript.jsx]` `length = 120`),
  `[languages.<lang>.rules]` with every rule, and
  `[languages.<lang>.lint]` and `.tests` with `timeout_seconds` and `run_at`, plus
  `command` for Go and Rust (the default text or your answer);
- TypeScript's and JavaScript's default commands are worked out for each package, so their stage sections
  get no `command` unless you gave one. The comment above each lists what every
  package runs now, from the plan (`#   apps/web: npm test`), and how to set one
  command for all;
- `[hooks]` with `mode` and `max_stop_iterations` (and `exclude_extra` when languages
  are excluded). The comment above it lists the built-in exclude list, one glob a
  line, and says that `exclude_extra` adds to it while `exclude` would replace it.

The values come from Ariadne's built-in defaults (`ariadne-config`), not from a
plugin `defaults.toml`. Filling in never changes what a setting resolves to, so the
file behaves as before for every language checked:

- a key the file already sets is never touched (only an answer changes it);
- a stage key a language takes from the top-level `[lint]` or `[tests]` (Go, Rust) is
  not added to the language's own section;
- a language's own limit (Go `cyclomatic`, `.tsx` `length`) is not added when the
  file sets that limit in a section it falls back to (`[thresholds]`, or
  `[languages.typescript]` for `.tsx`): that value applies to the language now;
- `[test_code]` `length` is not added when a function of any language may already be
  longer (a raised `length`): the built-in test limit only loosens, while a value in
  `[test_code]` is used as it is;
- a section written as an inline table is left unfilled.

Each language picked gets its sections even when the folder has no files of it yet.
When no language is picked, the file gets `version` and `[hooks]` only.

#### Refusals and exit codes

`--apply` refuses with one line on stderr and writes nothing:

| exit | when |
|---|---|
| `0` | applied (or the dry run printed) |
| `2` | the answers file is unreadable, not JSON, not schema 1, answers a question twice, names an unknown id (an `install.` id included) or has a value its question does not take; a change is not confirmed (`confirmed` and `previous`); `default` on a TypeScript stage the file sets; `git.use-parent` is `yes` (run `ariadne init` at that root instead); the folder's `.ariadne.toml` is invalid, is a link to nothing, or (when something changes) mixes line endings, cannot be printed back byte for byte (a byte-order mark), uses an inline table where an answer writes, or cannot be written; `git init` failed after the file was written |
| `3` | the folder changed since the plan: an answer's question is not asked any more (`git.init` once a repository exists; a language Ariadne does not check), or a confirmed answer's `previous` is not what the file sets now. Make and answer the plan again |

## Known limits

- **Not a shell parser.** Words are split at `;`, `&` and `|` only. Quotes, subshells
  and `$(...)` are not understood. A program started only through a script, such as
  `make test`, is checked as `make` alone.
- **rustup before 1.28 ignores `RUSTUP_AUTO_INSTALL`.** With such a rustup, the
  probe for a project whose toolchain is not installed can start installing it; the
  10-second timeout then stops it.
- **Build constraints are ignored.** Go directories excluded by build constraints
  still show in their module.
- **`--apply` edits standard tables only.** A section written as an inline table
  (`languages = { go = { … } }`) is refused where an answer writes into it, and left
  unfilled; edit it by hand.
- **A full file fixes the defaults it writes.** A later release that changes a
  built-in default does not change a file init wrote, and a plugin `defaults.toml`
  (organisation defaults) is overridden by the values the file spells out. The
  TypeScript per-package listing is a comment written once: it does not follow later
  changes to the packages.
- **A language checked later keeps `[thresholds]`.** The own limits of a language not
  checked when the file was filled (Go's `cyclomatic = 15`, `.tsx` `length = 120`)
  are not written; once `[thresholds]` sets that limit, the language takes it (Go:
  `cyclomatic` 10) until you add its own value by hand or with the limits answer.
