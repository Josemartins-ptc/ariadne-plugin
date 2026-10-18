#!/usr/bin/env python3
"""Turn results/ into the tables of report.md (rules: design.md, "Reporting rules").

Prints Markdown: one raw row per run (nothing dropped), then medians per task and overall
with the range across runs, then the judging results.
"""
import json
import statistics
from pathlib import Path

import os

SERIES = os.environ.get("EVAL_SERIES", "sonnet")
RESULTS = Path(__file__).resolve().parent / ("results" if SERIES == "sonnet" else f"results-{SERIES}")
ARMS = ("without", "with")


def load():
    runs = []
    for path in sorted(RESULTS.glob("*/*-[0-9]/first.json")):
        first = json.loads(path.read_text())
        follow_path = path.with_name("follow.json")
        follow = json.loads(follow_path.read_text()) if follow_path.exists() else None
        runs.append((first, follow))
    return runs


def tokens(run):
    return run["input_tokens"] + run["output_tokens"] + run["cache_read"] + run["cache_creation"]


def frac(h):
    return f"{h['passed']}/{h['total']}" if h else "–"


def rate(h):
    return h["passed"] / h["total"] if h and h["total"] else 0.0


def row_values(first, follow):
    m, run = first["metrics"], first["run"]
    liz, cog, ari = m.get("lizard", {}), m.get("cognitive", {}), m.get("ariadne", {})
    hooks = run.get("hook_events") or {}
    v = {
        "cost": run["cost_usd"] or 0, "tokens": tokens(run), "out_tokens": run["output_tokens"],
        "wall": run["wall_s"], "turns": run["turns"] or 0, "hidden": rate(first["hidden"]),
        "functions": liz.get("functions", 0), "ccn_max": liz.get("ccn_max", 0), "ccn_p90": liz.get("ccn_p90", 0),
        "ccn_over_10": liz.get("ccn_over_10", 0), "nloc": liz.get("nloc_total", 0), "nloc_max": liz.get("nloc_max", 0),
        "cog_max": cog.get("max"), "cog_over_15": cog.get("over_15"),
        "ariadne_cog_max": ari.get("cognitive_max"), "ariadne_over": ari.get("over_limits"),
        "edit_blocks": hooks.get("edit_blocks", 0), "stop_blocks": hooks.get("stop_blocks", 0),
        "error": bool(run.get("is_error")) or run.get("subtype") != "success",
    }
    if follow:
        frun = follow["run"]
        v.update({
            "f_cost": frun["cost_usd"] or 0, "f_tokens": tokens(frun), "f_wall": frun["wall_s"],
            "f_turns": frun["turns"] or 0, "f_hidden": rate(follow["hidden_follow"]),
            "f_regress": rate(follow["hidden_first_again"]) if follow.get("hidden_first_again") else None,
            "f_diff": follow["diff"]["added"] + follow["diff"]["removed"],
            "f_error": bool(frun.get("is_error")) or frun.get("subtype") != "success",
        })
    return v


def med(values):
    values = [x for x in values if x is not None]
    if not values:
        return "–"
    m = statistics.median(values)
    lo, hi = min(values), max(values)
    fmt = (lambda x: f"{x:.3f}") if isinstance(m, float) and m < 10 else (lambda x: f"{x:,.0f}")
    return f"{fmt(m)} ({fmt(lo)}–{fmt(hi)})"


def main():
    runs = load()
    print("## Raw runs\n")
    print("| task | arm | rep | hidden | cost $ | tokens | turns | wall s | functions | CCN max | cognitive max | Ariadne over | edit/stop blocks | follow-up hidden | first tests after | follow-up cost $ | follow-up tokens | lines changed |")
    print("|" + "---|" * 18)
    for first, follow in runs:
        v = row_values(first, follow)
        r = first["run"]
        print(f"| {first['task']} | {first['arm']} | {first['rep']} | {frac(first['hidden'])} | {v['cost']:.3f} | {v['tokens']:,} | {v['turns']} | {v['wall']} | {v['functions']} | {v['ccn_max']} | {v['cog_max'] if v['cog_max'] is not None else '–'} | {v['ariadne_over']} | {v['edit_blocks']}/{v['stop_blocks']} | "
              + (f"{frac(follow['hidden_follow'])} | {frac(follow.get('hidden_first_again'))} | {v['f_cost']:.3f} | {v['f_tokens']:,} | {v['f_diff']} |" if follow else "– | – | – | – | – |")
              + (" ⚠ error" if v["error"] or v.get("f_error") else ""))
    keys = [("cost", "first task cost $"), ("tokens", "first task tokens"), ("wall", "first task wall s"),
            ("turns", "first task turns"), ("hidden", "hidden tests passed (share)"), ("functions", "functions"),
            ("ccn_max", "worst CCN (lizard)"), ("ccn_p90", "CCN 90th pct (lizard)"), ("ccn_over_10", "functions CCN > 10"),
            ("nloc_max", "longest function NLOC"), ("cog_max", "worst cognitive (gocognit/SonarJS)"),
            ("ariadne_over", "functions over Ariadne limits (circular)"), ("edit_blocks", "Ariadne edit blocks"),
            ("stop_blocks", "Ariadne stop blocks"), ("f_cost", "follow-up cost $"), ("f_tokens", "follow-up tokens"),
            ("f_wall", "follow-up wall s"), ("f_turns", "follow-up turns"), ("f_hidden", "follow-up hidden passed (share)"),
            ("f_regress", "first-task tests still passing after follow-up"), ("f_diff", "follow-up lines changed")]
    by = {}
    for first, follow in runs:
        by.setdefault((first["task"], first["arm"]), []).append(row_values(first, follow))
    tasks = sorted({t for t, _ in by})
    print("\n## Medians per task (range across the 3 runs)\n")
    for task in tasks:
        print(f"\n### {task}\n\n| measure | without Ariadne | with Ariadne |\n|---|---|---|")
        for key, label in keys:
            print(f"| {label} | {med([v.get(key) for v in by.get((task, 'without'), [])])} | {med([v.get(key) for v in by.get((task, 'with'), [])])} |")
    print("\n## All tasks together (medians of all 18 runs per arm)\n\n| measure | without Ariadne | with Ariadne |\n|---|---|---|")
    for key, label in keys:
        print(f"| {label} | {med([v.get(key) for (t, a), vs in by.items() if a == 'without' for v in vs])} | {med([v.get(key) for (t, a), vs in by.items() if a == 'with' for v in vs])} |")
    totals = {arm: sum(v["cost"] + v.get("f_cost", 0) for (t, a), vs in by.items() if a == arm for v in vs) for arm in ARMS}
    print(f"\nTotal spend: without {totals['without']:.2f} $, with {totals['with']:.2f} $ (first task + follow-up).")
    judges = sorted(RESULTS.glob("*/judge-*.json"))
    if judges:
        print("\n## Blind judging\n\n| task | rep | order 1 | order 2 | counted |\n|---|---|---|---|---|")
        tally = {"with": 0, "without": 0, "tie": 0}
        for path in judges:
            j = json.loads(path.read_text())
            tally[j["result"]] += 1
            print(f"| {j['task']} | {j['rep']} | {j['verdicts'][0]['winner']} | {j['verdicts'][1]['winner']} | **{j['result']}** |")
        print(f"\nPreferred: with Ariadne {tally['with']}, without {tally['without']}, no agreement/tie {tally['tie']} (of {len(judges)} pairs).")
        print("\nReasons given:\n")
        for path in judges:
            j = json.loads(path.read_text())
            for v in j["verdicts"]:
                print(f"- {j['task']} rep {j['rep']}, A={v['A']}, B={v['B']}: {v['choice']} — {v['reason']}")


if __name__ == "__main__":
    main()
