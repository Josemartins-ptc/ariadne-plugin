# Configuration

## `.ariadne.toml`

A `.ariadne.toml` in your project sets the limits and the commands Ariadne runs.
What each limit measures: [checks.md](checks.md).
Every key is optional; a missing key keeps its default. Unknown keys are errors.

The nearest `.ariadne.toml` above a file governs that file. Configs do not inherit from
each other, and the search stops at the repository root.

The agent cannot edit this file (Ariadne blocks it). Changes to it are yours.

The easy way to make it is `/ariadne:init` in Claude Code. It asks which languages the
project uses and whether to take the defaults, then writes every setting here, each with
a comment giving its default ([install.md](../README.md#set-up-a-project),
[init.md](init.md)). After that you change settings by editing this file. You can also
write it by hand: every key is optional.

Commit `.ariadne.toml` like any other project file. Do not git-ignore it:

- **Subagents in git worktrees** start from the last commit. A file that is not
  committed, or that git ignores, never reaches them: they use the committed version, or
  the defaults when there is none.
- **Changes apply from the next turn.** Ariadne reads the file as it was when the turn
  started. A change takes effect from your next message, and for a subagent from its
  next run. A worktree subagent also needs the change committed first.
- **CI** (`ariadne check`) uses the committed file too.

```toml
version = 1                  # optional; when present it must be 1

[thresholds]                 # every language; the values below are the defaults
cyclomatic = 10
cognitive = 15
length = 80                  # lines per function, blank and comment lines included
parameters = 7               # declared parameters, receiver / self excluded
nesting = 4                  # deepest if / loop / switch / catch, counted from 1
# Each limit is also accepted under [languages.<lang>] and [[overrides]].
# There is no "off" value: set a large number (length = 10000) to relax one.
# 0 is accepted, like every limit, and fails nearly every function.

[languages.go]               # one language (Go default: cyclomatic 15)
cyclomatic = 15

[languages.go.rules]
count_err_check = true       # false: a plain `if err != nil` adds nothing

[languages.rust.rules]
count_try_operator = false   # true: each `?` adds a point

[languages.typescript.tsx]   # .tsx files only, above [languages.typescript]
length = 120                 # the default: JSX takes more lines

[test_code]                  # test functions only (see "Test code" below)
length = 150                 # tests get at least 150 lines unless you set this yourself

[[overrides]]                # different limits for some paths; the last match wins
paths = ["internal/legacy/**"]
cyclomatic = 25

[[exemptions]]               # one function that may exceed the limits
path = "cmd/main.go"
function = "run"
reason = "dispatch table, reviewed"

[lint]                       # first check at the end of a turn
command = "go vet {packages}"  # leave out for the language default; "" turns it off
timeout_seconds = 300
run_at = "every-stop"        # every-stop | main-stop (see "When a stage runs")

[tests]                      # last check at the end of a turn
command = "go test {packages}" # leave out for the language default; "" turns it off
timeout_seconds = 600
run_at = "every-stop"

[languages.typescript.tests] # one language's own command (see "Lint and test commands")
command = "pnpm test"        # leave out for the per-package default; never [lint]/[tests]
timeout_seconds = 600

[hooks]
mode = "changed"             # changed | ratchet | all
max_stop_iterations = 5      # rounds the agent gets to fix things (1 to 8)
max_workspace_repos = 5      # see how-it-works.md (1 to 10)
exclude = [                  # the default list
    "vendor/**",
    "node_modules/**",
    "**/generated/**",
    "**/*.pb.go",
    "target/**",
    "**/node_modules/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}",
    "**/dist/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}",
    "build/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}",
    "**/coverage/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}",
    "**/.next/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}",
    "**/*.min.js",
    "**/*.d.ts",
]
exclude_extra = []           # globs added to the list above (see "Paths")
```

A function fails when its score is **above** the limit (equal passes).

### Which limit applies

For a function in a given file, each limit is looked up on its own: the last matching
`[[overrides]]`, else `[languages.<lang>]`, else `[thresholds]`, else the built-in default.
In a `.tsx` file, `[languages.typescript.tsx]` comes between `[[overrides]]` and
`[languages.typescript]`. The order applies config by config, the highest first
(`.ariadne.toml`, then `plugin/defaults.toml`, then the built-in defaults). So the
built-in `.tsx` length of 120 is only a default: a `length` you set under `[thresholds]`
or `[languages.typescript]` applies to `.tsx` files too, unless you also set `length`
under `[languages.typescript.tsx]`. For example, `[thresholds] length = 60` gives `.tsx`
functions 60 as well; to keep `.tsx` looser, add `[languages.typescript.tsx] length = 120`.

`[languages.typescript.tsx]` takes the five limit keys (`cyclomatic`, `cognitive`,
`length`, `parameters`, `nesting`) and applies to `.tsx` files only; `.ts`, `.mts` and
`.cts` files never read it. Its only default is `length = 120`: components laid out in
JSX run longer than other code (with 80, the TypeScript spike failed 12.8% of `.tsx`
functions; with 120, 7.6%).

`[languages.javascript.jsx]` is the same for `.jsx` files (built-in `length = 120`), between
`[[overrides]]` and `[languages.javascript]`. `.js`, `.mjs` and `.cjs` files never read it,
even when they hold JSX; give such a project a looser length with an `[[overrides]]` entry
(`paths = ["src/components/**"]`).

For a test function, in order:

1. a matching `[[overrides]]` entry;
2. a `[test_code]` value you set (in `.ariadne.toml` or `plugin/defaults.toml`);
3. the order above, but never below the built-in test default (length 150).

Examples: `[thresholds] length = 60` leaves tests at 150; `[thresholds] length = 200`
gives tests 200 too; `[test_code] length = 100` gives tests 100.

### Test code

`[test_code]` takes the same five keys as `[thresholds]` (`cyclomatic`, `cognitive`,
`length`, `parameters`, `nesting`) and applies only to test functions. Only `length` has
a default (150 lines), and it only ever loosens: a test gets the larger of 150 and its
normal length limit. A key you leave unset uses the normal limit. The section is
accepted only at the top level, not under `[languages.<lang>]` or `[[overrides]]`.

What counts as a test function:

| Language | Test functions |
|---|---|
| Go | every function in a file whose name ends in `_test.go` |
| Rust | a function inside a `#[cfg(test)]` module (at any depth); a function with a `#[test]` attribute or one whose path ends in `::test` (`#[tokio::test]`), and functions nested in it; every function in a file under a `tests` folder (`tests/`, `crates/x/tests/support/mod.rs`) |
| TypeScript | every function in a file whose name ends in `.test`, `.spec`, `.e2e-spec`, `.e2e`, `.integration-test` or `.cy` before a TypeScript extension (`cart.test.ts`, `Button.cy.tsx`); every function in a file under a folder named `__tests__`, `__mocks__`, `test`, `tests`, `testing` or `e2e` |
| JavaScript | the same, with a JavaScript extension (`cart.test.js`, `Button.cy.jsx`, `api.spec.mjs`) |
| Java | every function in a file under a test source set (`src/test/`, `src/testFixtures/`, `src/integrationTest/`, `src/it/`, Android's `src/androidTest/`, `src/testDebug/`: a set whose name starts with `test`, ends with `Test` or is `it`), or named `*Test.java`, `*Tests.java`, `*IT.java` or `*TestCase.java` |

The `tests` folder (and each TypeScript test folder) is looked for in the path relative to
the repository root, so a repository that happens to sit inside a `tests` folder is not
all test code. Outside a git
repository the path is relative to where Ariadne runs, so a lone file is recognised as
under `tests/` only when Ariadne runs from a folder above that `tests` folder.

Known limit: Rust test attributes that do not end in `test`, such as `#[rstest]`,
`#[test_case]`, `#[wasm_bindgen_test]` and `#[quickcheck]`, are recognised only inside a
`#[cfg(test)]` module or a `tests/` folder.

### Paths

Paths and globs in `[[overrides]]`, `[[exemptions]]`, `[hooks] exclude` and
`[hooks] exclude_extra` are relative to the folder of the `.ariadne.toml` they are in.
For example, in `svc/.ariadne.toml`:

```toml
[[overrides]]
paths = ["parsers/**"]       # means svc/parsers/**
cyclomatic = 25
```

To skip more files and keep the built-in list, use `exclude_extra`. Its globs are added to
the built-in list, so entries a later Ariadne release adds to that list still apply:

```toml
[hooks]
exclude_extra = ["legacy/**", "apps/web/build/**"]
```

`exclude_extra` adds up across config files: the globs of `.ariadne.toml` and of
`plugin/defaults.toml` all apply. It is added to `exclude` too when you set one.

Globs in `plugin/defaults.toml` (`exclude` and `exclude_extra`) are not relative to the
plugin's folder: they are matched relative to the folder of the project's `.ariadne.toml`
that governs the file, or to the repository root when there is none. So `"src/**"` there
means `src/` next to the project's `.ariadne.toml`.

An `exclude` list you set replaces the built-in list; it does not add to it. Copy the
built-in entries you want to keep. The full built-in list:

```toml
[hooks]
exclude = [
    "vendor/**",
    "node_modules/**",
    "**/generated/**",
    "**/*.pb.go",
    "target/**",
    "**/node_modules/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}",
    "**/dist/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}",
    "build/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}",
    "**/coverage/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}",
    "**/.next/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}",
    "**/*.min.js",
    "**/*.d.ts",
    # your own entries here, e.g. "apps/web/build/**"
]
```

A pattern without `**/` in front matches from the config's folder only: `build/**` is the
top-level `build`, not `apps/web/build`. The TypeScript and JavaScript build output
and dependency entries (`node_modules` below the top, `dist`, `build`, `coverage`,
`.next`) name the TypeScript and JavaScript extensions, because a Go or Rust project may
keep its sources in a `build/` or `dist/` folder; Go and Rust files there are still
checked. `node_modules`, `dist`, `coverage` and `.next` are skipped at any depth, so
each app of a monorepo or npm/yarn workspace is covered (`apps/web/node_modules`,
`apps/web/dist`, `apps/frontend/.next`, `packages/a/coverage`). `build` is skipped only at the top,
because a `build` folder deeper down (`src/build/`) often holds real sources; to skip a
nested one, add it, e.g. `"apps/web/build/**"`. Build output is usually ignored by git,
so the hooks never see it changed; the entries matter for `ariadne check` and for output
that is committed.

### Modes

- `changed` (default): check functions whose lines changed, and every function in a new
  file.
- `ratchet`: like `changed`, but a function that was already over the limit passes if
  its score did not go up.
- `all`: check every function in each changed file.

### Lint and test commands

`{packages}` is replaced by the Go packages that changed. Default commands:

| Language | Lint | Tests |
|---|---|---|
| Go | `go vet {packages}` | `go test {packages}` |
| Rust | `cargo clippy --all-targets` | `cargo test` |
| TypeScript | per package: `npm run type-check` (or `typecheck`, `check-types`), else the installed `tsc --noEmit --skipLibCheck` | per package: `npm run test:unit` (or `test:unit:ci`, `unit`), else `npm test` |

Each language can have its own commands in `[languages.<lang>.lint]` and
`[languages.<lang>.tests]` (`go`, `rust`, `typescript`). They take the same keys as
`[lint]` and `[tests]` (`command`, `timeout_seconds`, `run_at`), work in every `.ariadne.toml` and in
`plugin/defaults.toml`, and are looked up per changed file's language:

- **Go and Rust:** `[languages.<lang>.<stage>]`, else the top-level `[lint]` / `[tests]`,
  else the language default, key by key. A `[languages.go.tests] command` with no
  `timeout_seconds` keeps the `[tests] timeout_seconds`. Without the new sections nothing
  changes.
- **TypeScript:** only `[languages.typescript.<stage>]`. It never uses the top-level
  `[lint]` / `[tests]`, which in a mixed repository are usually another language's
  command. With no TypeScript `command`, each package runs its default commands (see
  [TypeScript](#typescript) below). Its default timeouts are the same (lint 300 s, tests
  600 s).
- **JavaScript:** only `[languages.javascript.<stage>]`, as TypeScript (see
  [JavaScript](#javascript) below).
- **Java:** only `[languages.java.<stage>]`, for the same reason. Its default timeouts are
  lint 300 s and tests 900 s, since JVM builds are slow.

Config files are read highest first (`.ariadne.toml`, then `plugin/defaults.toml`, then the
built-in defaults), so a `[tests]` in your `.ariadne.toml` beats a `[languages.go.tests]`
in `plugin/defaults.toml`. Within one file the language's own section comes first.

A Go repository with a TypeScript frontend in `web/`:

```toml
[tests]                      # Go (and Rust) files
command = "go test -race {packages}"

[languages.typescript.tests] # TypeScript files, run in web/ (its package.json)
command = "npm run test:ci"
```

Without the `[languages.typescript.tests]` section, editing `web/src/App.tsx` runs the
default test command in `web/`, and `go test` never runs in `web/`.

Rust commands run once per crate (the nearest `Cargo.toml`), in the crate's folder.
A command that checks the whole workspace (it has `--workspace` or `--all`, no
`{packages}`, and no `;`, `&&`, `||`, `|`, `&` or line break) runs only once, in the
workspace folder (the nearest `Cargo.toml` with a `[workspace]` table, inside the
repository), for all the changed crates that are members of that workspace. A crate is
a member when it is the root package, or when a `members` entry names its folder,
written out or with `*` and `?` inside one folder name. A crate still runs on its own,
as before, when:

- it is not a member (not listed, or listed only through `**`, `[...]` or `{...}`);
- the workspace table has an `exclude` key;
- a `Cargo.toml` on the way cannot be read or does not parse;
- its `Cargo.toml` names its workspace elsewhere (`package.workspace`);
- the command contains `--manifest-path`.

What goes into `{packages}`:

- A Go folder is left out, with a note, when every `.go` file in it has a build
  constraint naming one tag that a normal build does not set, such as
  `//go:build tools`, `ignore`, `integration` or `e2e`. `go vet` and `go test` would
  fail there with "build constraints exclude all Go files". A `tools.go` next to
  ordinary files changes nothing.
- An OS, architecture, `unix`, `cgo`, `gc`, `gccgo`, `goX.Y` or `goexperiment.*` tag
  never leaves a folder out, because a normal build may set it.
- A constraint with `&&`, `||` or `!` (such as `//go:build tools && linux`) never
  leaves a folder out either. This is a known limit.
- A command that contains `-tags` (`go test -tags integration {packages}`,
  `-tags=x`, or `GOFLAGS=-tags=x` written in the command) chooses its own tags, so no
  folder is left out for it. Tags set only through a `GOFLAGS` environment variable are
  not seen: put them in the command instead.
- In Rust, a deleted folder is replaced by its nearest folder that still exists inside
  the crate (at most the crate folder, `.`). Deleting `src/old/` gives `./src`.

The default clippy command blocks on errors only. For a strict gate:

```toml
[lint]
command = "cargo clippy --all-targets -- -D warnings"
```

A ready-made Rust config is in [examples/rust.ariadne.toml](examples/rust.ariadne.toml).
A first `cargo test` on a cold build can take longer than 600 s; raise
`[tests] timeout_seconds` if it does.

#### When a stage runs

`run_at` says which stops run a lint or tests stage:

- `"every-stop"` (default): the main conversation's stop and each subagent's hand-back.
- `"main-stop"`: only the main conversation's stop. When a subagent hands back, the stage
  does not run for files whose settings say `main-stop`: it gets a note instead
  (`note: tests left to the main conversation's stop in .; not blocking`), those files
  count as not covered, and no round is spent. The main conversation's next stop with no
  subagent running runs it, over every change, the subagent's included.

The complexity check always runs, at every stop: a subagent still has to fix a function
over the limits before it hands back. `run_at` only moves lint and tests.

With `main-stop`, a subagent's files are tested only by a later main conversation's stop
with no subagent running and rounds left. They are not tested when:

- the main stop has used up its rounds (it then checks only complexity and lets the turn
  end);
- the session ends while subagents are still running (the main stop defers lint and tests
  while they run);
- known limit: a subagent in a git worktree is tested by the main stop while its worktree
  exists, or once its branch is merged into the main checkout. If the worktree is removed
  first and its branch is never merged there (kept for a pull request, or merged
  elsewhere), Ariadne never runs its tests. A run judged on its branch after its worktree
  is gone ignores `run_at`: lint and tests cannot run there, and say so with their usual
  "no module root found" notes.

It is looked up like `command` and `timeout_seconds`: `[languages.<lang>.<stage>]`, then,
for Go and Rust, the top-level `[lint]` / `[tests]`, key by key, highest config first;
TypeScript reads only `[languages.typescript.<stage>]`. Each file goes by its own
settings, so with nested configs one hand-back can run tests for some files and leave
others to the main stop. Any other value is a config error naming the key and the two
allowed values.

A slow test suite that subagents should not run each time they hand back:

```toml
[tests]
command = "go test -race {packages}"
run_at = "main-stop"         # subagents hand back after lint and complexity

[languages.typescript.tests]
run_at = "main-stop"         # TypeScript never reads [tests]: set it here too
```

#### When a tool is not installed

A lint or test command that fails only because a tool it runs is not installed does not
block the agent. Its stage gets a note instead (`note: lint not run in .: go is not
installed; not blocking`), its files count as not covered, and no round is spent. This
holds for the default commands and for your own, in every language. Ariadne sees it in
the failed run itself, at each stop, so a tool installed during the session is used at
the next stop:

- the shell exited with status 127 and printed that it could not find the first word
  of one of the command's parts between `&&`, `||`, `;` and `|` (`|&` too; the `&` of
  `2>&1`, `>&2` or `&>log` splits nothing): `sh: go: command not found` (bash),
  `sh: 1: go: not found` (dash) or `zsh:1: command not found: go` (zsh). Only the name
  right before (zsh: right after) the "not found" counts. A part's first word comes
  after any `NAME=value` assignments and the wrappers `exec`, `env`, `command`, `nice`
  and `time` (with their `-` options). So `cd web && npm test` with no `npm` and
  `make lint; golangci-lint run` with no `golangci-lint` both give the note, naming
  that tool. This is a plain split, not a shell parser: quotes, subshells and `$(...)`
  are not parsed. A word with a `/` in it (`./scripts/lint.sh`) is a file of your
  project, not a tool, so a missing script still blocks;
- the shell exited with status 127 and `env` said a script's interpreter is missing
  (`env: node: No such file or directory`, GNU `/usr/bin/env: 'node': No such file or
  directory`): a `#!/usr/bin/env node` script such as TypeScript's
  `node_modules/.bin/tsc` with no `node` installed. The note names `node`;
- cargo said it has no such subcommand (``error: no such command: `clippy` ``) or rustup
  said the toolchain lacks a component (`error: 'cargo-clippy' is not installed for the
  toolchain ...`, or `... for the custom toolchain ...`), as the first output line
  that is not a `warning:`: the note names `clippy` (or the subcommand or component).

Known limits: these still block, as an ordinary failure.

- A nested shell: `sh -c '...'`, `bash -c '...'` or `dash -c '...'` whose command is
  missing.
- A tool run by another program: `make lint` whose recipe runs a missing tool (make
  exits 2), or an npm or just script whose inner tool is missing (the line names the
  inner tool, which is a project dependency).
- Shell messages in another language than English (Linux bash under a non-English
  locale; dash and macOS bash always print English).
- rustup's other words: a toolchain that is not installed (`toolchain '...' is not
  installed`), or a binary that is "not applicable" to the toolchain.
- A wrapper option that takes a value: `nice -n 5 golangci-lint run` reads `5` as the tool.

The other way round: a project script whose `#!/usr/bin/env` line names an interpreter
that is not installed (for example a typo, `#!/usr/bin/env pyhton`) is a note naming it,
not a block.

To check those files, install the tool (clippy: `rustup component add clippy`) or set
the stage's `command` to one that is installed. The agent is told only which tool is
missing, never how to install it: installing system tools is yours to decide.

#### JavaScript

JavaScript runs the same defaults as TypeScript, in the same packages, with one
difference: lint is only a type-check script (`npm run type-check`, else `typecheck`,
else `check-types`). With none, lint is skipped with the note `no type-check script in
package.json`; there is no `tsc` fallback. Its sections are `[languages.javascript.lint]`
and `[languages.javascript.tests]`.

A package with both TypeScript and JavaScript files (a `.ts` app with a
`jest.config.js`) runs a command once when both languages' files need the same one in
the same folder. To run one command for both, set it in both sections; `command = ""` in
one turns the stage off for that language's files only.

**A project that used Ariadne before JavaScript was checked.** Ariadne now also checks the
JavaScript files of your existing projects. Build output (`dist`, `.next`, `coverage`, a
root `build`, `node_modules`, `*.min.js`) is already skipped. Consider asking Claude which
JavaScript files in your real projects would now be checked: vendored scripts, generated
bundles or old code you do not want judged. You can skip any extra folders with
`exclude_extra` in `.ariadne.toml` (see [Paths](#paths)):

```toml
[hooks]
exclude_extra = ["public/vendor/**", "scripts/legacy/**"]
```

#### Java

Java runs one Gradle or Maven command per build, from the build's root, naming the
modules with changed files:

| Build | Lint (compile main and test code) | Tests |
|---|---|---|
| Gradle | `./gradlew --console=plain :core:testClasses :web:testClasses` | `./gradlew --console=plain :core:test :web:test` |
| Maven | `mvn -B -q -pl core,web -am test-compile` | `mvn -B -q -pl core,web -am test` |

- A **module** is the nearest folder with `build.gradle`, `build.gradle.kts` or `pom.xml`,
  or a deeper project that `settings.gradle(.kts)` names with `include` (a subproject the
  root build configures, without a build file of its own). Its **build root** is the
  nearest folder with `settings.gradle(.kts)` (Gradle), or the outermost `pom.xml` that
  lists it in `<modules>` (Maven; entries inside comments or `<profiles>` do not count,
  and `./core`, `core/` and `core/pom.xml` all name `core`). A file outside every module
  gets the note `no Gradle or Maven build file found`.
- A Gradle module the settings do not `include`, such as `buildSrc`, has no task to name:
  the stage is skipped with a note. Settings that compute their projects (no `include`
  line Ariadne can read) are taken as including every module.
- The build's own wrapper runs when it has one (`./gradlew`, `./mvnw`), else the installed
  `gradle` or `mvn`. Neither installed, or no Java runtime: a note, never a block.
- Maven's `-am` also builds, and tests, the modules the changed ones depend on, which it
  needs. When the root module itself changed, Maven runs the whole build.
- A Gradle module path is taken from its folder (`libs/core` is `:libs:core`). A build
  whose `settings.gradle` moves a project to another folder needs its own command.
- **Android modules** (the Android plugin, by its id or its version-catalog alias
  `libs.plugins.android.…`, an `android { … }` block, or `src/main/AndroidManifest.xml`)
  have no plain `test` task: when any changed module is one, the stage is skipped for the
  whole build, with a note. Set `[languages.java.tests]` to the task you want, for example
  `command = "./gradlew testDebugUnitTest"`.
- Maven modules listed by a path outside the aggregator's folder (`<module>../core</module>`)
  are not found: each runs as its own build (known limit).
- Java never uses the top-level `[lint]` and `[tests]`. Its own sections are
  `[languages.java.lint]` and `[languages.java.tests]`, with timeouts of 300 s and 900 s.
  To add PMD, Checkstyle or SpotBugs, set `command` there.

#### TypeScript

TypeScript has default commands, so lint and tests run with no configuration. Each
package runs its own:

- **tests:** `npm run test:unit` (else `test:unit:ci`, else `unit`), else `npm test`.
  Scripts for other suites (`test:e2e`, `test:integration`, ...) never run by default.
- **lint** (type checking): `npm run type-check` (else `typecheck`, else `check-types`),
  else the installed `node_modules/.bin/tsc --noEmit --skipLibCheck`, one run per
  referenced project for
  a solution-style `tsconfig.json`. A `lint` script never runs.
- The defaults need the package's own dependencies installed. Every package in its
  `package.json`'s `dependencies` and `devDependencies` must be in a `node_modules`
  folder, in the package or any folder above it (as Node looks; each may be at a
  different level). `optionalDependencies` and `peerDependencies` are not checked. A
  package that declares none needs any `node_modules` folder there. Ariadne never
  installs anything and never runs `npx`.
- A subagent's worktree inside the checkout (`.claude/worktrees/<name>`) uses the
  checkout's `node_modules` when it holds all the dependencies (npm or Yarn hoisting), as
  Node would. With pnpm, each package installs into its own `node_modules`, which the
  worktree lacks, so the worktree gets the not-installed note: install in the worktree,
  or set the commands.

The full rules are in [languages.md](languages.md#lint-and-test-commands). `npm run` works
for npm, pnpm and Yarn projects that install into `node_modules`: npm only runs the
script, with the package's `node_modules/.bin` on the `PATH`.

A package where a default cannot run is skipped for that stage with a note, and never
blocks: no test script, no type-check script and no `tsc`, dependencies not installed, or
Yarn Plug'n'Play. To check it, install the dependencies, or set the command yourself.
The top-level `[lint]` and `[tests]` never apply to TypeScript; use its own sections. A
set `command` always wins over the defaults, whatever the package's scripts and
`node_modules`, and `command = ""` turns the stage off with no note.

When to set a command:

- **Scripts that work only through pnpm** (they call `pnpm -r`, `--filter` or `turbo`
  themselves): `[languages.typescript.tests] command = "pnpm test"`.
- **Yarn Plug'n'Play** (a `.pnp.cjs`, and no `node_modules` holding the dependencies; a
  tool cache such as `node_modules/.vite` does not count): the defaults cannot run. Set
  `[languages.typescript.lint] command = "yarn tsc --noEmit"` and
  `[languages.typescript.tests] command = "yarn test"`.
- **A `test` script that also runs end-to-end tests:** add a `test:unit` script that runs
  only the unit tests (the default prefers it), or set
  `[languages.typescript.tests] command = "node_modules/.bin/vitest run src"`.
- **A slow `pretest`:** npm runs `pretest` before `npm test` (for example
  `prisma generate` in a backend). To skip it, call the runner directly:
  `[languages.typescript.tests] command = "node_modules/.bin/jest"`.
- **Type checking with other flags** that live in another script
  (`"lint": "tsc --noEmit --strict && eslint ."`): add a `type-check` script, or set
  `[languages.typescript.lint] command = "node_modules/.bin/tsc --noEmit --strict"`.
- **A solution-style `tsconfig.json` you prefer to check in build mode:**
  `[languages.typescript.lint] command = "node_modules/.bin/tsc -b --noEmit"` (the default
  checks each reference with `-p` instead; see
  [languages.md](languages.md#lint-and-test-commands)).
- **References to composite projects that are not built yet:** the default `tsc --noEmit`
  fails with `TS6305` until they are built. Build the referenced projects once
  (`tsc -b`, which writes their output), or set `[languages.typescript.lint]` to your own
  type-check command. (`tsc -b --noEmit` fails here with `TS6310`.)

The `tsc` fallback writes no JavaScript; with `"incremental": true` in the
`tsconfig.json` (the Next.js and NestJS templates) it writes the `.tsbuildinfo` file, and
nothing else.

A command runs once per package, in the package's folder. A changed file's package is the
nearest folder above it whose `package.json` has a script the default test command would
run (`test:unit`, `test:unit:ci`, `unit`, or a real `test`: present, and not npm's
placeholder `echo "Error: no test specified" && exit 1`), looking no higher than the
repository root. When no `package.json` up to the repository root has one, it is the
nearest folder with a `package.json` inside the repository. A `package.json` that cannot
be read or is not valid JSON counts as having no scripts. A file with no
`package.json` above it inside the repository runs nothing, with the note `no
package.json found`: a `package.json` above the repository root is never used. The
package is the same for a default and for a set command.

`{packages}` works for TypeScript too: it is replaced by the folders of the changed files,
relative to the package folder and quoted (`'./src' './src/lib'`, or `'.'` for the
package folder itself); a deleted folder is replaced by its nearest folder that still
exists inside the package. Most TypeScript test and lint scripts take no folder
arguments, so it is rarely useful; leave it out unless your tool takes folders.

A monorepo with a frontend and a backend, each with its own `test` script:

```
package.json            "test": "turbo run test"
apps/web/package.json   "test": "jest"
apps/api/package.json   "test": "jest"
packages/shared/package.json   "test": "vitest run"
```

A change in `apps/web` runs the command in `apps/web` only, a change in `apps/api` in
`apps/api` only, and a change in both runs each once. The root `turbo run test` is never
chosen. A change in `packages/shared` runs only that package's tests, not those of the
apps that use it (a known limit). When only the root `package.json` has a `test` script
(the packages have none), every change runs the command at the root. To run each package
on its own anyway, give each one a `test` script, or put a `.ariadne.toml` with its own
`[languages.typescript.tests]` in each package folder.

In TypeScript, deleting a folder leaves its package to check: the command still runs in
the package.

A ready-made TypeScript config is in
[examples/typescript.ariadne.toml](examples/typescript.ariadne.toml).

### Organisation-wide defaults

`plugin/defaults.toml` sits between the built-in defaults and each project's
`.ariadne.toml`. Put settings there that every project on the machine should share.

## Command line

```
ariadne check [--format human|json|html] [--changed-since <REF>] [PATHS]...
ariadne explain <FILE | FILE:LINE | FILE:FUNCTION>
ariadne status
ariadne debt clear [--dry-run]
ariadne --version
```

- `ariadne check` with no path checks the current directory.
- `--changed-since <REF>` checks only functions whose lines changed since that git
  revision.
- `--format json` is for scripts; `--format html > report.html` writes a page you can
  open in a browser.
- `ariadne explain` shows a function's five scores and lists every point it scored,
  line by line. The target is split at the first `:` whose left side is an existing
  file, so a function name may contain `:` (`a.test.ts:it("adds: one")`,
  `routes.ts:app.get("/users/:id")`). Quote the target in a shell when it has characters
  such as `(`, `"`, or spaces: `ariadne explain 'a.test.ts:it("adds: one")'`. The
  command printed at the end of a report is already quoted that way when it needs to be.

Exit codes of `check`: `0` all within limits, `1` at least one function over a limit,
`2` a configuration, usage or read error.

`ariadne status` shows what the hooks last recorded in the current folder: the checks
still blocking, the rounds used, the subagents running, how many times each session was
flagged (edits and Stop blocks, subagents included) and the complexity debt. It writes
nothing.

`ariadne debt clear` removes the complexity debt recorded for the current repository or
worktree: the record and the saved copies its files are judged against. Outside git it
removes only the current folder's files from the shared record. With `--dry-run` it
lists the files and writes nothing. It cannot be undone.

To set a project up, use `/ariadne:init` in Claude Code. Setting projects up from a
script without Claude is described in [init.md](init.md#under-the-hood-for-scripts).

`ariadne hook <event>` is what the Claude Code plugin calls; you do not run it yourself.

## CI

Run from the repository root:

```sh
ariadne check --changed-since origin/main
```

It fails the job (exit 1) when a changed function is over its limit. Add a `CODEOWNERS`
rule for `.ariadne.toml` so limit changes need a reviewer.
