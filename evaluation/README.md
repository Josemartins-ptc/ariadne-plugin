# Does Ariadne make Claude's code better?

We measured it. Six small coding tasks (Go, TypeScript, JavaScript, Rust), each run three
times with Ariadne and three times without it, on two Claude models. The code was measured
with tools Ariadne does not use, and a blind reviewer picked the version it would rather
maintain.

- **[report.md](report.md)**: the results, in plain words, including the limits of the test.
- **[design.md](design.md)**: the plan, written before the first run, and every change made after.
- **[results/](results/)** (Claude Sonnet) and **[results-opus/](results-opus/)** (Claude Opus):
  every run, nothing dropped. Each `<task>/<arm>-<rep>/` folder holds the code Claude wrote
  (`code/`), the code after the follow-up change (`follow_code/`), and the measurements
  (`first.json`, `follow.json`). `judge-<rep>.json` holds the blind verdicts and their reasons.
  `summary.md` has all the tables.
- **[tasks/](tasks/)**: each task's prompt, starter repo, hidden tests, reference solution and
  follow-up change.

## Run it yourself

You need Claude Code (logged in), Python 3, Go, Node.js and Rust.

```bash
cd evaluation
./setup-tools.sh                         # the measuring tools, at the versions we used
python3 run.py validate                  # the reference solutions pass every hidden test
EVAL_SERIES=opus python3 run.py all --jobs 4    # 36 first runs + 36 follow-ups
EVAL_SERIES=opus python3 run.py judge           # blind judging
EVAL_SERIES=opus python3 summarize.py           # the tables
```

`EVAL_SERIES=sonnet` (the default) uses Claude Sonnet. Results already present are skipped,
so move or delete `results*/` to start fresh. The "with" arm uses this repository's own
`plugins/ariadne`; set `ARIADNE_PLUGIN_DIR` to test another copy. Our full runs cost about
11 $ (Opus) and 5 $ (Sonnet) per arm, first task plus follow-up.
