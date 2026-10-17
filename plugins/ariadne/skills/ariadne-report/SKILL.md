---
name: ariadne-report
description: Make an Ariadne HTML complexity report and open it. Use when the user asks for an "Ariadne report", an "HTML complexity report", "what is over the limits", "which functions are too complex", or "the complexity of this project" (or of some files or folders, or of the code changed since a branch or commit).
allowed-tools: Bash("${CLAUDE_PLUGIN_ROOT}/bin/ariadne" check *), Bash(mktemp -d *), Bash(open *), Bash(xdg-open *)
---

# Ariadne HTML report

Ariadne's own binary writes the report. Your job is to pick the paths, run it, and
give the user the file.

## Rules

- Always run the binary by this exact path, in double quotes:
  `"${CLAUDE_PLUGIN_ROOT}/bin/ariadne"`. Never use a bare `ariadne`.
- Run it from the project folder.
- Write the report to the path the user names. If they name none, write it to a new
  temporary file (step 2). Never write it into the project unless the user names a path
  there.
- Do not read the HTML back or retell it. The user opens it.

## 1. Pick what to check

- **Paths:** the files or folders the user names. Default: `.`, the whole project.
- **Changed code only:** when the user asks only for what changed (since a branch, a
  commit or `main`), add `--changed-since <ref>`, with the ref they name. It needs a git
  repository.

## 2. Pick the output file

- If the user names a file, use it. Call it `OUT`.
- Otherwise make a new temporary folder (macOS `mktemp` only fills in the X's at the
  very end of a name, so the template must end with them), and use
  `<that folder>/report.html` as `OUT`:

  ```sh
  mktemp -d "${TMPDIR:-/tmp}/ariadne-report.XXXXXX"
  ```

## 3. Run the check

```sh
"${CLAUDE_PLUGIN_ROOT}/bin/ariadne" check --format html <paths> > "OUT"
```

With changed code only:

```sh
"${CLAUDE_PLUGIN_ROOT}/bin/ariadne" check --format html --changed-since <ref> <paths> > "OUT"
```

The exit code is the result, not a failure:

- **0:** every function is within the limits.
- **1:** some functions are over the limits. The report is written and lists them. This
  is a result, not an error. Do not retry and do not "fix" it unless the user asks.
- **2:** the check could not run (a bad path, an invalid `.ariadne.toml`, a ref that does
  not exist, or no git repository for `--changed-since`). Its one-line message is on
  stderr. Show it, and say the report was not made.

## 4. Give the user the report

- On macOS, run `open "OUT"`. On Linux, run `xdg-open "OUT"`.
- If that fails, or there is no desktop, just print the path.
- In one line, tell the user where the report is, and whether functions are over the
  limits (exit 1) or not (exit 0).
