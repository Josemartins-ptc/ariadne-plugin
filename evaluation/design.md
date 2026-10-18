# Does Ariadne make Claude's code better? Experiment design

Written 2026-10-18, **before any run**. The measures, the tasks and the way results are
reported are fixed here, so the report cannot pick what looks good afterwards. Anything
changed after the first run is listed in the report, with the reason.

## Question

When Claude Code writes code with Ariadne on, compared with the same Claude without it:

1. How much more does it cost (tokens, money, time)?
2. Is the code it leaves behind measurably better, judged by things Ariadne does not control?

## The trap we avoid

Ariadne makes Claude push its own scores down, so "Ariadne's scores went down" proves
nothing. Ariadne's scores are reported for completeness, but every conclusion rests on
measures Ariadne does not optimise: hidden tests, outside complexity tools, the cost of
the next change, and blind judging.

## Setup

- **Two arms, one difference.** Both run `claude -p` with `--setting-sources project,local`
  (none of the user's plugins or settings). Arm **with** adds
  `--plugin-dir plugins/ariadne` (this repository): the published Ariadne 0.1.0,
  built-in defaults (no `.ariadne.toml`). Arm **without** has no Ariadne. Checked
  2026-10-18: the init message lists the same plugins in both arms, plus `ariadne` in one.
- **Model:** `claude-sonnet-5-5` for every task run in both arms (cost; a common choice for
  Claude Code). Recorded per run from the result message.
- **Tools and permissions:** `--permission-mode acceptEdits` and the same `--allowedTools`
  in both arms: read/edit/write tools plus the task language's own commands (`go`,
  `cargo`, `node`, `npm`). Same prompt, word for word. A cap of `--max-budget-usd 4` per
  run; a run that hits it counts as a failed run, reported.
- **Isolation:** every run starts from a fresh copy of the task's starter repository (a git
  repo with one commit) in its own temp folder. Hidden tests are never in that folder.
- **Repeats:** 3 runs per task per arm (Claude varies between runs).

## Tasks

Six small, realistic tasks whose rules tend to produce branchy code if written in one go.
Each has a starter repo (types, a stub, a few visible tests the prompt mentions), a precise
written spec in the prompt, **hidden tests** (broader, never shown), a reference
implementation (used only to prove the hidden tests are correct and passable), a
**follow-up change** with its own hidden tests and reference.

| Task | Language | First task | Follow-up change |
|---|---|---|---|
| `go-pricing` | Go | price quote: member and volume discounts, coupons with conditions, shipping by region and weight, tax | gift cards applied after tax; a new region |
| `go-logstats` | Go | parse access-log lines and compute stats (status classes, top paths, p95 latency, malformed lines) | filter by method and time window; per-method counts |
| `ts-signup` | TypeScript | validate a signup form (email, password rules, age by country, username, referral checksum, consent) | phone validation by country; password must not contain the username |
| `ts-orders` | TypeScript | order state machine (events, guards, cancel and refund rules, returns window) | an on-hold state with a fraud check |
| `js-markdown` | JavaScript | render a Markdown subset to safe HTML (headings, emphasis, code, links with an allowlist, lists, escaping) | block quotes and fenced code blocks |
| `rust-config` | Rust | parse an INI-like config (sections, typed values, lists, escapes, env overrides, required keys, errors with line numbers) | duration values (`30s`, `5m`, `1h`) and defaults |

Tasks are written to be fair to both arms: the spec does not mention complexity, style or
Ariadne; it asks for working code and says where the visible tests are.

## Measures (all pre-registered)

**First task (per run):**
1. Cost: total tokens (input, output, cache read, cache creation), USD, wall time, turns.
2. Correctness: hidden tests passed / total.
3. Outside complexity, from tools Ariadne does not run:
   - lizard (all four languages): per function cyclomatic number (CCN), NLOC, parameters;
     reported as the worst function, the 90th percentile, and the count of functions with
     CCN > 10;
   - gocognit (Go) and ESLint `sonarjs/cognitive-complexity` (TS/JS): cognitive complexity,
     worst and 90th percentile. Rust has no independent cognitive tool here: lizard only.
4. Ariadne's own scores (worst cognitive, functions over the limits): reported, but
   labelled circular.
5. Size: lines of code and number of functions.

**Follow-up (the strongest measure):** for every first-task result, a fresh session
**without Ariadne** (both arms' code gets the same treatment) receives the follow-up
prompt. Measured: cost (as above), the follow-up hidden tests, the first task's hidden
tests again (did the change break anything), and the size of the change (lines added and
removed). Question it answers: is the code easier and safer to change afterwards?

**Blind judging:** for each task and run number, the two arms' results are shown side by
side to `claude-opus-5-5` (a different model from the one that wrote the code), labelled
only "A" and "B", with the arm order randomised; each pair is judged twice with the order
swapped, to cancel position bias. Rubric: "Which version would you rather maintain: easier
to read, to understand and to change safely? Answer A, B or tie, with one sentence." Ariadne,
complexity tools and the experiment are not mentioned. A pair counts for an arm only when
both orders agree; otherwise it is a tie.

## Reporting rules

- Every run appears in the raw tables, including failures, crashes and budget hits.
- Summaries are medians per task and overall, with the run-to-run spread; no p-values on
  3 runs. Differences smaller than the spread are called "no clear difference".
- Results that favour the arm without Ariadne are reported with the same weight.
- Limits are stated: small sample, synthetic tasks, one model, default limits, a judge from
  the same model family.

## Cost estimate

6 tasks × 2 arms × 3 runs = 36 first-task runs, 36 follow-up runs, 36 judge calls.
Expected roughly USD 40–120 in total; the report gives the real figure.

## Files

`evaluation/`: `tasks/<task>/` (starter, prompt, hidden tests, reference, follow-up),
`run.py` (runner), `results/` (raw JSON per run, tool outputs), `report.md`.

## Changes after the first run (2026-10-18)

- **A second series with Opus.** We added `claude-opus-5-5` as the coding model
  (the model most people use for serious work). The Sonnet series (`results/`) is kept and
  reported as a second data point. The Opus series (`results-opus/`) uses the same tasks,
  prompts, measures and rules; its judge is `claude-fable-5-1`, so the judge is never the
  model that wrote the code. Decided before any Opus run.
- **Runner fixes found by the pilot** (pilot runs are excluded from all results and not published): ESLint
  ignored files outside its config folder (now a temporary config in the measured folder);
  hidden test paths are relative to `hidden/`; Ariadne's blocks are counted from the session
  transcript, since hook messages are not in the stream output.
- **Observed in the pilot:** Claude Code lists installed plugin skills to the model, so with
  Ariadne installed Claude knows a complexity checker is present. Some runs pass without any
  block. The report separates runs with blocks from runs without.
