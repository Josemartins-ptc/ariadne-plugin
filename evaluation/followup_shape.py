#!/usr/bin/env python3
"""Worst function before and after each follow-up change (lizard), per series and arm. Run from this folder."""
import json, statistics as st, sys
from pathlib import Path
sys.path.insert(0, str(Path.cwd()))
import run
for series in ("results", "results-opus"):
    print("==", series)
    agg = {}
    for d in sorted(Path(series).resolve().glob("*/*-[0-9]")):
        task = json.loads((Path("tasks").resolve()/d.parent.name/"task.json").read_text())
        task.setdefault("name", d.parent.name)
        before = run.measure(task, d/"code"); after = run.measure(task, d/"follow_code")
        arm = d.name.split("-")[0]
        b, a = before.get("lizard", {}), after.get("lizard", {})
        row = (b["ccn_max"], a["ccn_max"], b["nloc_max"], a["nloc_max"], a["ccn_over_10"], max(before.get("cognitive",{}).get("values",[0]) or [0]), 0)
        agg.setdefault(arm, []).append(row)
        print(f"{d.parent.name:12} {d.name:10} CCN {b['ccn_max']:>2}->{a['ccn_max']:>2}  NLOCmax {b['nloc_max']:>3}->{a['nloc_max']:>3}  over10 {b['ccn_over_10']}->{a['ccn_over_10']}")
    for arm, rows in agg.items():
        print(arm, "median CCN max before/after", st.median(r[0] for r in rows), st.median(r[1] for r in rows),
              "NLOC max", st.median(r[2] for r in rows), st.median(r[3] for r in rows),
              "runs with any CCN>10 after", sum(r[4] > 0 for r in rows), "/", len(rows))
