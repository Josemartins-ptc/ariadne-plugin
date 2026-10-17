---
description: Make an Ariadne HTML complexity report of this project (or of a path, or of the code changed since a ref) and open it.
argument-hint: "[path] [--changed-since REF]"
allowed-tools: Bash("${CLAUDE_PLUGIN_ROOT}/bin/ariadne" check *), Bash(mktemp -d *), Bash(open *), Bash(xdg-open *)
---

# Ariadne HTML report

The user typed: `$ARGUMENTS`

Ariadne's own binary writes the report. Your job is to run it and give the user the
file.

## Rules

- Always run the binary by this exact path, in double quotes:
  `"${CLAUDE_PLUGIN_ROOT}/bin/ariadne"`. Never use a bare `ariadne`.
- Run it from the project folder.
- Write the report to a new temporary file (step 2). Never write it into the project.
- Do not read the HTML back or retell it. The user opens it.

## 1. Read the arguments

- **Paths:** every argument that is not `--changed-since` or its ref. Default: `.`, the
  whole project.
- **`--changed-since REF`:** judge only the code changed since `REF`. Pass it on as it
  is. It needs a git repository.

## 2. Make the output file

Make a new temporary folder (macOS `mktemp` only fills in the X's at the very end of a
name, so the template must end with them), and use `<that folder>/report.html` as `OUT`:

```sh
mktemp -d "${TMPDIR:-/tmp}/ariadne-report.XXXXXX"
```

## 3. Run the check

```sh
"${CLAUDE_PLUGIN_ROOT}/bin/ariadne" check --format html <paths> > "OUT"
```

With `--changed-since`:

```sh
"${CLAUDE_PLUGIN_ROOT}/bin/ariadne" check --format html --changed-since <REF> <paths> > "OUT"
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
