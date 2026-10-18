# Ariadne for Claude Code

![Go](https://img.shields.io/badge/Go-supported-00ADD8?logo=go&logoColor=white)
![Rust](https://img.shields.io/badge/Rust-supported-B7410E?logo=rust&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-supported-3178C6?logo=typescript&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-supported-F7DF1E?logo=javascript&logoColor=black)
![Platforms](https://img.shields.io/badge/platforms-macOS%20%7C%20Linux-informational)
![Claude Code plugin](https://img.shields.io/badge/Claude%20Code-plugin-D97757)

Ariadne helps Claude Code write simpler, easier-to-maintain code. It measures every
function Claude writes or changes, and when one is too complex or too long, it asks
Claude to refactor it (smaller functions, less nesting, clearer flow) before the work is done.

It gives every function five scores:

| Score | What it measures |
|---|---|
| **Cyclomatic** | how many paths run through the function |
| **Cognitive** | how hard it is to read (nested code costs more) |
| **Length** | how many lines it has |
| **Parameters** | how many parameters it takes |
| **Nesting** | how deep its `if`s, loops and `switch`es go |

After each edit, and before Claude ends its turn, Ariadne checks the functions Claude
changed. If one is over its limit, Claude is told which one and why, and has to simplify it
before it can stop. At the end of a turn it also runs your lint and tests. The same input
always gives the same result. [What Ariadne checks](docs/checks.md) explains each score with
an example.

This repository holds the ready-built plugin for macOS and Linux (arm64 and x86_64). You do
not need Rust or any build step.

## Install

```sh
claude plugin marketplace add Josemartins-ptc/ariadne-plugin
claude plugin install ariadne@ariadne-plugins
```

Or, inside a Claude Code session: `/plugin marketplace add Josemartins-ptc/ariadne-plugin`,
then `/plugin install ariadne@ariadne-plugins`, then `/reload-plugins`.

No SSH key for GitHub? Add the marketplace by its HTTPS address instead:
`claude plugin marketplace add https://github.com/Josemartins-ptc/ariadne-plugin.git`.

Check that it works: in a Claude Code session in one of your projects, ask for a small code
change. When the turn ends you should see a line starting with `Ariadne`.
[docs/messages.md](docs/messages.md) explains every message.

## Set up a project

In a Claude Code session in your project (or in an empty folder for a new one):

1. Run `/ariadne:init`.
2. Pick the languages the project uses (Go, TypeScript, JavaScript, Rust; you can pick
   several, even ones with no files yet).
3. For each language, take Ariadne's defaults or set your own limits and lint and test
   commands.
4. Check the file it shows you and say yes. It writes `.ariadne.toml` with every setting
   spelled out, so you can change it later by editing the file.
5. Commit `.ariadne.toml`, so subagents working in git worktrees use it too.

You run `/ariadne:init` once per project. Details: [docs/init.md](docs/init.md) and
[docs/configuration.md](docs/configuration.md).

Ariadne also checks JavaScript files. Consider asking Claude which JS files in your real
projects would be checked (vendored scripts, generated bundles, old code you do not want
judged). You can skip any extra folders with `exclude_extra` in `.ariadne.toml`:

```toml
[hooks]
exclude_extra = ["public/vendor/**", "scripts/legacy/**"]
```

## What you can ask Claude

| Ask | What happens |
|---|---|
| `/ariadne:init` | Sets Ariadne up for the project and writes `.ariadne.toml` |
| `/ariadne:report [path] [--changed-since REF]`, or "make an Ariadne report", "what is over the limits?" | Writes an HTML report of every function's scores and opens it |
| `/ariadne:status` | Shows what Ariadne last recorded here: the checks still blocking, the rounds used, the subagents running and the complexity debt files |

While the plugin is enabled, Claude can also run `ariadne check <path>` and
`ariadne explain <file>:<function>` itself.

## Default limits

| | cyclomatic | cognitive | length | parameters | nesting |
|---|---|---|---|---|---|
| Go | 15 | 15 | 80 | 7 | 4 |
| Rust | 10 | 15 | 80 | 7 | 4 |
| TypeScript | 10 | 15 | 80 (`.tsx` 120) | 7 | 4 |
| JavaScript | 10 | 15 | 80 (`.jsx` 120) | 7 | 4 |

Test functions get at least 150 lines; their other limits are the same. A function fails
when any score is above its limit; equal passes.

Lint and test commands: Go runs `go vet` and `go test`, Rust `cargo clippy` and
`cargo test`. TypeScript and JavaScript run each package's own scripts (a type-check script,
`npm run test:unit` or `npm test`; TypeScript also the installed `tsc`) when the package's
dependencies are installed. See [docs/languages.md](docs/languages.md) and
[docs/configuration.md](docs/configuration.md).

## Update

Turn on automatic updates in `/plugin` → Marketplaces → `ariadne-plugins` → "Enable
auto-update", or update by hand:

```sh
claude plugin marketplace update ariadne-plugins
claude plugin update ariadne@ariadne-plugins
```

Then run `/reload-plugins` in open sessions.

## Turn off or remove

```sh
claude plugin disable ariadne@ariadne-plugins     # off, still installed
claude plugin enable ariadne@ariadne-plugins      # back on
claude plugin uninstall ariadne@ariadne-plugins   # removed
```

## A whole team

Commit this in a project's `.claude/settings.json`. Teammates are offered the plugin when
they trust the folder:

```json
{
  "extraKnownMarketplaces": {
    "ariadne-plugins": {
      "source": { "source": "github", "repo": "Josemartins-ptc/ariadne-plugin" }
    }
  },
  "enabledPlugins": {
    "ariadne@ariadne-plugins": true
  }
}
```

## Troubleshooting

- **`ariadne: unsupported operating system` or `unsupported architecture`**: Ariadne runs
  on macOS and Linux, on arm64 (aarch64) and x86_64. Windows is not supported.
- **No `Ariadne` line after a turn**: run `claude plugin list`, check that ariadne is
  enabled, then `/reload-plugins`.
- **Every check runs twice**: two copies of Ariadne are enabled (for example one installed
  from another marketplace). Keep one: `claude plugin list`, then `claude plugin uninstall`
  the other.
- **macOS says the binary "cannot be opened because the developer cannot be verified"**:
  run `xattr -dr com.apple.quarantine ~/.claude/plugins/cache/ariadne-plugins` and try again.
- **A change to `.ariadne.toml` seems ignored**: it takes effect from your next message.
  Subagents in git worktrees only see it once it is committed.
- **`lint not run` or `tests not run`**: a tool or the project's dependencies are not
  installed, or the stage is off. The note in the block report says which;
  `/ariadne:status` shows the last state.

## Does it help? We measured it

Six coding tasks in four languages, with and without Ariadne, on two Claude models: every
function met the limits in 36 of 36 runs with Ariadne (0 of 36 without), a blind reviewer
preferred the Ariadne code in 34 of 36 pairs, and every hidden test passed in both. The
method, the tasks and every run are in [evaluation/](evaluation/), with a
[plain-words report](evaluation/report.md).

## Documentation

- [What Ariadne checks](docs/checks.md) and [how the scores are counted](docs/metrics.md)
- [How the plugin works](docs/how-it-works.md): the hooks, the stop gate, subagents, known limits
- [Configuration](docs/configuration.md): `.ariadne.toml`, limits, lint and test commands
- [Setting up with /ariadne:init](docs/init.md)
- [Languages](docs/languages.md): what is reported and counted in each language
- [Messages](docs/messages.md): every message Ariadne shows
- Example configs: [docs/examples](docs/examples)

## License

Apache License 2.0, see [LICENSE](LICENSE) and [NOTICE](NOTICE). This repository holds the
plugin files and ready-built binaries; the source code is not published.
