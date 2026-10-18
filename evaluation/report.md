# Does Ariadne make Claude's code better? Report

Runs done 2026-10-18. The design was written before the first run (`design.md`), and every
change made after that is listed at its end. Raw data for every run: [`results/`](results/) (Sonnet) and
[`results-opus/`](results-opus/) (Opus): the code Claude wrote, the follow-up code, the
measurements and the judge verdicts. The Claude session logs are not published (they hold
system prompts and local paths). The full tables are in [`results/summary.md`](results/summary.md) and
[`results-opus/summary.md`](results-opus/summary.md). No run was dropped.

## Short answer

- **Every function met the limits in 36 of 36 runs with Ariadne, against 0 of 36 without
  it.** The model sometimes wrote small functions on its own; Ariadne made sure of it every
  time.
- **The code gets simpler, as measured by tools Ariadne does not use.** Across both models
  and all six tasks, the most complex function written with Ariadne scored about half (or
  less) on lizard's cyclomatic number and on gocognit or SonarJS cognitive complexity. The
  longest function was about a third as long.
- **A blind reviewer preferred the code written with Ariadne in 17 of 18 pairs, in both
  series.** The reviewer was a different model, didn't know about Ariadne, and saw each pair
  in both orders.
- **Correctness was the same.** Every run in both arms passed every hidden test. These tasks
  were too easy to show a difference here.
- **The cost depends on the model.** With Sonnet, Ariadne made the first task cost about
  1.7× more (more turns, because Ariadne blocked and Claude split functions). With Opus, the
  cost was the same: Opus mostly wrote small functions from the start and was rarely blocked.
- **The next change was not clearly cheaper.** A later change to the code (made without
  Ariadne) cost about the same and passed all tests in both arms. We hoped simpler code would
  make the next change cheaper. On these small tasks it didn't, in either direction.
- **Good code stays good.** A later change, made with Ariadne switched off, kept the small
  functions small; code that started with long, complex functions got more complex.
- **We don't know how much a plain instruction would do.** Most Opus runs improved before
  Ariadne blocked anything. This experiment did not test a simple "keep functions small"
  line in CLAUDE.md. An instruction can be ignored; Ariadne's check cannot, which is what
  the 36 of 36 above shows.

## What was compared

Six small tasks: two in Go, two in TypeScript, one in JavaScript, one in Rust. Each had a
written spec, a starter repo, hidden tests, and a later "follow-up" change. Each task ran
3 times **without** Ariadne and 3 times **with** the published Ariadne 0.1.0 (default
limits, no config file). Everything else was the same in both arms: prompt, tools,
permissions, and no user plugins or settings. This was done twice: once with
`claude-sonnet-5-5` writing the code, then once with `claude-opus-5-5`.

Measured per run:

- cost in tokens, dollars, wall time and turns;
- hidden tests passed;
- complexity from outside tools: lizard (all four languages), gocognit (Go), and ESLint
  `sonarjs/cognitive-complexity` (TS/JS); Rust has only lizard;
- the follow-up change, done by a fresh session **without** Ariadne on each result: its
  cost, its hidden tests, whether the first task's tests still passed, and lines changed;
- blind judging: a different model (Opus judged the Sonnet code, `claude-fable-5-1` judged
  the Opus code) saw both versions as "A" and "B" and was asked which it would rather
  maintain. Each pair was asked twice, with the order swapped. A pair counts only when both
  answers agree.

## Results: all tasks together

Medians of 18 runs per arm, with the lowest and highest run in brackets.

### Sonnet writing the code

| measure | without Ariadne | with Ariadne |
|---|---|---|
| first task cost $ | 0.107 (0.072–0.165) | 0.181 (0.075–0.318) |
| first task tokens | 104k (71k–155k) | 195k (73k–456k) |
| first task wall time s | 25 (12–47) | 49 (14–92) |
| first task turns | 5 (4–7) | 9.5 (4–17) |
| hidden tests passed | 100% (all runs) | 100% (all runs) |
| worst function, lizard CCN | 26 (16–41) | 9 (6–12) |
| worst function, cognitive (gocognit/SonarJS) | 31 (19–42) | 8 (5–13) |
| longest function, lines | 71 (36–84) | 24 (17–42) |
| functions with CCN > 10 | 1 (1–3) | 0 (0–1) |
| number of functions | 4.5 (1–10) | 14 (4–16) |
| runs Ariadne blocked at least once | – | 16 of 18 |
| follow-up cost $ | 0.103 (0.078–0.191) | 0.111 (0.096–0.178) |
| follow-up hidden tests passed | 100% | 100% |
| first-task tests still passing after follow-up | 100% | 100% |
| follow-up lines changed | 37 (23–134) | 42 (22–128) |
| blind judge preferred | 1 pair | **17 pairs** |

### Opus writing the code

| measure | without Ariadne | with Ariadne |
|---|---|---|
| first task cost $ | 0.278 (0.152–0.426) | 0.267 (0.170–0.508) |
| first task tokens | 163k (72k–274k) | 165k (99k–273k) |
| first task wall time s | 51 (20–87) | 50 (23–98) |
| first task turns | 8 (4–11) | 8 (4–11) |
| hidden tests passed | 100% (all runs) | 100% (all runs) |
| worst function, lizard CCN | 18 (12–29) | 9.5 (3–14) |
| worst function, cognitive (gocognit/SonarJS) | 19 (9–35) | 9 (2–14) |
| longest function, lines | 58 (18–75) | 22 (10–46) |
| functions with CCN > 10 | 1 (1–2) | 0 (0–1) |
| number of functions | 6.5 (1–15) | 14 (5–17) |
| runs Ariadne blocked at least once | – | 3 of 18 |
| follow-up cost $ | 0.304 (0.231–0.419) | 0.305 (0.250–0.479) |
| follow-up hidden tests passed | 100% | 100% |
| first-task tests still passing after follow-up | 100% | 100% |
| follow-up lines changed | 66 (26–184) | 52 (25–152) |
| blind judge preferred | 1 pair | **17 pairs** |

### Money actually spent

| | without Ariadne | with Ariadne |
|---|---|---|
| Sonnet series (first task + follow-up, 18 runs each) | 4.05 $ | 5.42 $ |
| Opus series (first task + follow-up, 18 runs each) | 10.73 $ | 11.14 $ |

Total for the coding runs: 31.34 $. The 72 judge calls were not metered by the runner and
are not included. The pre-run estimate (40–120 $) was too high.

## Results: task by task

The worst-function drop held on **every task, in both series**. On every task, the
highest worst-CCN of the three Ariadne runs was below the lowest of the three runs
without it.

Worst function, lizard CCN, median of 3 runs:

| task | Sonnet without | Sonnet with | Opus without | Opus with |
|---|---|---|---|---|
| go-logstats | 27 | 10 | 18 | 10 |
| go-pricing | 28 | 12 | 28 | 10 |
| js-markdown | 17 | 7 | 16 | 9 |
| rust-config | 26 | 9 | 21 | 11 |
| ts-orders | 18 | 8 | 18 | 3 |
| ts-signup | 36 | 9 | 20 | 8 |

First-task cost, median $:

| task | Sonnet without | Sonnet with | Opus without | Opus with |
|---|---|---|---|---|
| go-logstats | 0.128 | 0.209 | 0.326 | 0.351 |
| go-pricing | 0.077 | 0.075 | 0.155 | 0.171 |
| js-markdown | 0.085 | 0.179 | 0.278 | 0.259 |
| rust-config | 0.164 | 0.253 | 0.419 | 0.459 |
| ts-orders | 0.072 | 0.137 | 0.261 | 0.258 |
| ts-signup | 0.124 | 0.209 | 0.293 | 0.258 |

With Sonnet, Ariadne cost more on five of six tasks (`go-pricing` was the exception). With
Opus, the arms were within each other's range on every task.

## Where the gain came from: blocks vs. awareness

Ariadne works by blocking an edit or the end of a turn when a function is over the limits.
But with Ariadne installed, Claude Code also lists Ariadne's report skill to the model
("which functions are too complex…"). So Claude knows a complexity checker is present, even
if it is never blocked. Nothing else reaches the model: Ariadne adds no text to the prompt,
and its end-of-turn "all checks passed" line goes to the user, not to the model.

Splitting the "with" runs by whether Ariadne blocked:

| | runs | first task cost $ | tokens | worst CCN | longest function | worst cognitive |
|---|---|---|---|---|---|---|
| Sonnet, without | 18 | 0.107 | 104k | 26.5 | 71 | 31 |
| Sonnet, with, blocked | 16 | 0.193 | 211k | 8.5 | 24 | 8 |
| Sonnet, with, never blocked | 2 | 0.075 | 73k | 12 | 41.5 | 13 |
| Opus, without | 18 | 0.278 | 163k | 18.5 | 57.5 | 19 |
| Opus, with, blocked | 3 | 0.459 | 230k | 11 | 25 | 6 |
| Opus, with, never blocked | 15 | 0.258 | 161k | 9 | 22 | 9.5 |

What this means, plainly:

- **With Sonnet, the blocks did the work.** Sonnet usually wrote one long function first,
  got blocked, then split it. That is where the extra cost comes from.
- **With Opus, mostly awareness did the work.** In 15 of 18 runs Opus wrote small functions
  from the start and was never blocked, at no extra cost. The 3 blocked runs cost more.
- **We did not test whether a plain instruction gets the same result.** For example, a line
  in CLAUDE.md saying "keep functions small." Given the Opus result, that could get a good
  part of the gain. What it can't do is *check*: Ariadne's blocks are what guarantee the
  limits, as the Sonnet series shows. This is the most important open question. It should be
  tested before claiming more.

## The follow-up change

We expected simpler code to make the next change cheaper or safer. It didn't, clearly:

- cost, tokens, and turns were within each other's range on every task, in both series;
- every follow-up passed its hidden tests and broke none of the first task's tests, in both
  arms;
- lines changed went both ways (Sonnet: 37 without vs 42 with; Opus: 66 vs 52), within the
  spread.

So on files of 100–300 lines, Claude handles the long-function version just as well. Any
benefit for later changes would have to show on larger, older code, which this experiment
did not test.

### Good code stays good (added 2026-10-18, from the same follow-up runs)

The follow-up sessions ran **without** Ariadne, so they show what Claude does on its own
with the code it finds. Worst function (lizard), median of 18 results per arm, before and
after the follow-up change (`followup_shape.py`, output in `followup_shape.txt`):

| | started without Ariadne | started with Ariadne |
|---|---|---|
| Opus: worst CCN before → after | 18.5 → 21 | 9.5 → 10 |
| Opus: longest function before → after | 57.5 → 74 lines | 22.5 → 26.5 lines |
| Opus: results with a function over CCN 10 after | 18 of 18 | 5 of 18 |
| Sonnet: worst CCN before → after | 26.5 → 28.5 | 9 → 10 |
| Sonnet: longest function before → after | 71 → 77.5 lines | 24.5 → 39 lines |
| Sonnet: results with a function over CCN 10 after | 18 of 18 | 8 of 18 |

Claude follows the shape of the code it finds. Complex functions got more complex; code
that started with small functions got new small functions, with nobody checking. One
honest detail: with Sonnet, the longest function grew more in lines in the Ariadne arm
(+14.5 vs +6.5), though it stayed about half as long. This was not a pre-registered
measure; it was computed after the runs from the saved code.

## What the blind reviewer said

Both judges gave the same kind of reason for preferring the Ariadne version: each rule in
its own small, named function that can be read, tested, and changed alone; parsing kept
apart from aggregation; tables of data instead of long branching. Some typical reasons are
in `results*/summary.md`, quoted in full.

The one loss in each series was the same task and run number, `ts-orders` run 2. It was
different code in each series, but the judge's reason was the same both times: the Ariadne
version replaced one plain `switch` with a map of handler functions. That needed extra type
machinery and an unsafe cast, and the switch was "more direct and fully type-safe for seven
small cases." Splitting code isn't always an improvement, and a reviewer can tell when it
isn't.

## Limits of this experiment

- **Small sample.** 3 runs per task and arm, 6 tasks. We give medians and ranges, not
  significance tests.
- **Small, synthetic tasks**, each with a precise spec, written for this test. Real work is
  messier: larger files, vaguer requests, existing code.
- **Correctness hit the ceiling.** Every run passed every hidden test, so this says nothing
  about whether Ariadne helps or hurts correctness on harder work.
- **Fair prompts, with one note.** No prompt mentions complexity, style, or Ariadne. But
  two prompts (`go-pricing`, `rust-config`) say Claude may add helpers. That applies to
  both arms the same way.
- **Default limits only.** No `.ariadne.toml` was used. Other limits would give other
  numbers.
- **Judges from the same family.** The judges are Claude models too. They never judged code
  they wrote themselves (Opus judged Sonnet's code; Fable judged Opus's code), but they may
  share Claude's taste.
- **The follow-up ran without Ariadne**, on purpose, so both arms' code got the same
  treatment. It measures how easy the code is to change, not what Ariadne costs during
  maintenance.
- **Outside tools count differently from Ariadne.** For example, lizard counts `&&` and
  `||`. So a function within Ariadne's limits can still show CCN 11–14 in lizard.
- **No "instruction only" arm** (see above).

## Changes after the design was written

As listed at the end of `design.md`:

- We added a second series with Opus, the model most people use for serious work. The Sonnet series is kept
  and reported in full.
- The Opus series' judge is `claude-fable-5-1`, so no model judges its own code.
- The pilot found three bugs in the runner, which were fixed. Pilot runs are left out of all
  results and not published.
- The "blocked vs. never blocked" split was added after the pilot showed that some runs
  were never blocked.

The report adds one item that `design.md` did not plan: judging costs were not recorded.
