---
description: Set Ariadne up for this project. Asks which languages to check, which lint and test commands to run, and which limits to use; installs missing tools if you say yes; then writes .ariadne.toml.
allowed-tools: Bash("${CLAUDE_PLUGIN_ROOT}/bin/ariadne" init *), Bash(mktemp -d *), Bash(rustup component add clippy), Bash(npm install), Bash(pnpm install), Bash(yarn install), Bash(bun install), AskUserQuestion, Write
---

# Set up Ariadne for this project

Guide the user through Ariadne's setup. The `ariadne` binary decides what to ask and
writes the file. Your job is to ask the questions, run the installs the user agrees to,
and show what the binary prints.

## Rules

- Always run the binary by this exact path, in double quotes:
  `"${CLAUDE_PLUGIN_ROOT}/bin/ariadne"`. Call it `ARIADNE` below. Never use a bare
  `ariadne`.
- Run every `ARIADNE` command from the setup folder. This is the current folder, unless
  step 2 moves to a parent repository.
- Never create or edit `.ariadne.toml` with Write or Edit. Only `ARIADNE init --apply`
  writes it.
- Never edit `.gitignore`. Never run `git add` or `git commit`, and never offer to.
- Run an install only after the user says yes to that install. Run one at a time.
- Show the binary's output to the user as it is printed, in a code block. Do not
  shorten it or put it in your own words.
- If an `ARIADNE` command exits with an error, show its one-line message and follow
  step 9. Do not guess around it.

## 1. Read the plan

Run:

```sh
"${CLAUDE_PLUGIN_ROOT}/bin/ariadne" init --plan --format json
```

It writes nothing. It prints JSON, with these parts:

- `repository`: the repository state;
- `languages`: the languages found, and where;
- `stages`: each lint or test stage per place, with its command;
- `tools`: each tool those commands need, and whether it is installed;
- `config`: the folder's `.ariadne.toml`;
- `questions`: the questions to ask, in order.

Each question has an `id`, a `kind`, a `text` and a `default`. A question can also have
a `current`: the value the folder's `.ariadne.toml` already sets.

If `config.error` is not null, the file is invalid. Show the error, tell the user to fix
the file, and stop. No questions are asked.

## 2. A folder inside a repository (`git.use-parent`)

Only when a question has the id `git.use-parent`: ask it alone, before anything else.
Use its `text`, with two options: "Yes, set up the repository (recommended)" and "No,
set up this folder only".

- **Yes:** `repository.root` is the root, relative to this folder (for example `..`).
  Turn it into an absolute path and tell the user you are moving there. From now on, run
  every `ARIADNE` command as `cd "<absolute root>" && "${CLAUDE_PLUGIN_ROOT}/bin/ariadne" …`.
  Go back to step 1 at the root, and use only that new plan. The `git.use-parent`
  question is not answered: `--apply` refuses `"yes"`.
- **No:** stay in this folder. The answer is `"git.use-parent": "no"`.

## 3. Ask the questions

Ask the plan's questions in its order, with AskUserQuestion. Put up to 4 questions in
one call. Skip `install.*` questions here (step 4 asks them) and `git.use-parent` (step
2 asked it).

For every question:

- Use the plan's `text` as the question. It already shows the command for a stage.
- Put the default answer first, and add " (recommended)" to its label.
- Use a short `header`, such as `Git`, `Languages`, `Go lint`, `Go tests` or `Limits`.
- AskUserQuestion always adds an "Other" choice for free text. It takes the user's own
  command or numbers.

Ask in this order, so the user goes through init once and gets a complete file:

1. **`git.init`** (when asked) and **`languages`** in the first call. The languages
   question offers every language Ariadne checks, including ones the folder has no
   files of yet; the ones found are ticked by default. The user picks every language
   the project will use.
2. **Defaults or my own, per language picked:** one question per language, "Use
   Ariadne's defaults for <Language>?", showing its limits and its lint and test
   commands from the stage questions' text. Options: "Yes, the defaults"
   (recommended) and "Let me set them". On "Yes", answer that language's stage
   questions with their `default` and ask nothing more for it.
3. **For "Let me set them":** ask that language's stage questions (below), and the
   `limits` question once if any language asked for its own values.

Skip the stage questions of a language the user did not pick. A language that was
found but not picked stops being checked: `--apply` adds its files to
`[hooks] exclude_extra`. Say so when that happens.

`--apply` writes every setting of every picked language into `.ariadne.toml`, at the
answer or its default, so the user can later edit the file by hand instead of running
init again.

How each kind of question is asked, and the answer it gives (step 5 writes the
answers):

| kind | options | answer |
|---|---|---|
| `yes-no` (`git.init`) | "Yes" (recommended) and "No" | `"yes"` or `"no"` |
| `languages` | one option per entry of `options`, `multiSelect: true`; mark the ones in `default` (the languages found) "(found)" | the list of keys picked, such as `["go", "typescript"]` |
| `stage` | see below | an object, see below |
| `limits` | see below | an object, see below |

**A stage question** (`stage.<lang>.<stage>`). Offer these options, the default first:

1. **Keep** the default. Without a `current`, this is "Yes, the default command". With
   a `current`, it is "Keep what .ariadne.toml sets". Show the command from `commands`.
   The answer is the question's `default`, copied as it is.
2. **Main stop only.** Run it only when the main conversation stops, not when a subagent
   hands back. The answer is `default` with `"run_at": "main-stop"`. When
   `default.run_at` is already `main-stop`, offer "At every stop" instead, with
   `"run_at": "every-stop"`. Leave this option out when `default.choice` is `off`.
3. **Off.** Do not run it. The answer is `{ "choice": "off" }`. Leave this option out
   when `default.choice` is already `off`.
4. **Ariadne's default command.** Offer this only when `current.choice` is `custom` or
   `off`, and the language is not `typescript`. The answer is
   `{ "choice": "default", "run_at": <current.run_at> }`. TypeScript works out its
   default for each package, so the binary cannot write it back. When a TypeScript
   stage's `current.choice` is `custom` or `off`, tell the user that going back to the
   default means deleting that `command` line from `.ariadne.toml` by hand.

When the user types their own command in "Other", the answer is
`{ "choice": "custom", "command": "<their command>", "run_at": <default.run_at> }`. Use
`"main-stop"` instead when they say it runs only at the main stop. A command that is
empty means off.

**The limits question.** Offer these options:

- When the question's `default` is `default` (no `current`, or a `current` that holds
  exactly the built-in limits): "Keep the default limits" (recommended), with the
  answer `{ "choice": "default" }`, and "Set my own".
- When the `default` is `custom` (the file sets other limits): "Keep what
  .ariadne.toml sets" (recommended), with the answer
  `{ "choice": "custom", "values": <current> }`; "Use the default limits", with the
  answer `{ "choice": "default" }`; and "Set my own".

For "Set my own", or numbers typed in "Other", ask which limits to change. Show them
`defaults`, the built-in limits. The answer is
`{ "choice": "custom", "values": { "<section>": { "<key>": <number> } } }`:

- the sections are `thresholds`, `test_code`, `languages.<lang>` and
  `languages.typescript.tsx`;
- the keys are `cyclomatic`, `cognitive`, `length`, `parameters` and `nesting`;
- the numbers are whole numbers, 0 or more;
- give only the limits the user names.

**Changing what the file sets.** An answer can differ from the question's `current`
(the user picked another option than "Keep", or typed something new). Add two fields
to that answer:

- `"confirmed": true`;
- `"previous"`: the question's `current`, copied as it is.

Before you add them, ask the user: "Your .ariadne.toml sets <current>; change it to
<new>?". If the user says no, use the "Keep" answer. Never add `confirmed` to an answer
the user did not change.

## 4. Missing tools

Ask the plan's `install.*` questions one at a time, in the plan's order. Skip the ones
whose languages the user unchecked. Each one has a `command` and a `place` (the folder
to run it in, relative to the setup folder).

For each, use AskUserQuestion. Use its `text` as the question, and show the exact
command and folder. The options are "Yes, run it" (recommended) and "No".

- **Yes:** run the command in that folder: `cd "<place>" && <command>`, or the command
  alone when the place is `.`. Show its output. The answer is `"yes"`. If it fails, say
  so in one line and go on with the next question. The stage stays as it is: Ariadne
  skips it with a note at each stop, and never blocks, until the tool is installed.
- **No:** do not run anything. The answer is `"no"`. Ariadne skips the stages that need
  the tool, with a note at each stop.

Tools in `tools` with status `missing` or `unknown` but no `install.*` question cannot
be installed by Ariadne. Tell the user about each one, with its `reason` and its
`install` hint if there is one, such as `rustup toolchain install <name>`. Do not run
the hint.

## 5. Write the answers file

Make a new temporary folder:

```sh
mktemp -d "${TMPDIR:-/tmp}/ariadne-init.XXXXXX"
```

Use Write to create `answers.json` in that folder (call it `ANSWERS` below), with every
answer from steps 2 to 4:

```json
{
  "schema": 1,
  "answers": {
    "git.init": "yes",
    "languages": ["go", "typescript"],
    "stage.go.lint": { "choice": "default", "command": null, "run_at": "every-stop" },
    "stage.go.tests": { "choice": "default", "command": null, "run_at": "main-stop" },
    "stage.typescript.tests": { "choice": "off" },
    "limits": { "choice": "default" },
    "install.node_modules:web": "no"
  }
}
```

Leave out the questions you did not ask. Never put the file in the project.

## 6. Show the result

Run:

```sh
"${CLAUDE_PLUGIN_ROOT}/bin/ariadne" init --apply "ANSWERS" --dry-run
```

It writes nothing. It prints the changes, the resulting `.ariadne.toml` and a diff. Show
all of it.

If it says `Nothing to change`, tell the user that `.ariadne.toml` already holds these
answers. Skip step 7 and go to step 8.

## 7. Write it, on the user's yes

Ask with AskUserQuestion: "Write this .ariadne.toml?", with the options "Yes, write it"
(recommended) and "No". On no, stop. Nothing was written.

On yes, run:

```sh
"${CLAUDE_PLUGIN_ROOT}/bin/ariadne" init --apply "ANSWERS"
```

Show all of its output. When it prints this line, show it to the user exactly as it is:

```
Commit .ariadne.toml so subagents working in git worktrees use it.
```

Do not commit. The user decides when to commit.

## 8. Show the new state

Run:

```sh
"${CLAUDE_PLUGIN_ROOT}/bin/ariadne" init --plan
```

Show its output. Then tell the user, in two lines:

- the new settings take effect from their next message (a subagent picks them up on its
  next run);
- subagents that work in git worktrees use the file only once it is committed.

## 9. When `--apply` refuses

`--apply` prints one line on stderr. It writes nothing, except when `git init` fails
(see below). Show the line.

- **Exit 3:** the folder changed since the plan. Tell the user, then start again from
  step 1. Ask only the questions whose answers no longer fit.
- **Exit 2:** the line names the answer and why it was refused. Here is what to do for
  each refusal:
  - a change that is not confirmed: ask the user to confirm it (step 3), then write the
    file again;
  - `default` on a TypeScript stage the file sets: tell the user to delete that `command`
    line from `.ariadne.toml` by hand;
  - an invalid or unusable `.ariadne.toml`: tell the user what to fix by hand;
  - `git init` failed after the file was written: show the line, and tell the user to run
    `git init` themselves.
  Do not change the answers to get past a refusal without the user's word.
