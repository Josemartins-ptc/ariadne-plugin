#!/usr/bin/env python3
"""Ariadne evaluation runner (design: design.md, same folder).

  run.py first   TASK ARM REP     one first-task run (ARM: with | without)
  run.py follow  TASK ARM REP     the follow-up change on that run's result (always without Ariadne)
  run.py all     [--jobs N] [--tasks a,b] [--reps N]   every missing first run, then every missing follow-up
  run.py judge   [--tasks a,b]    blind pairwise judging of first-task results
  run.py table                    print a one-line summary per run

Everything is written under results/<task>/<arm>-<rep>/. A step whose result file exists is skipped,
so the command can be re-run after an interruption.
"""
import concurrent.futures
import json
import os
import random
import re
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

EVAL = Path(__file__).resolve().parent
TASKS = EVAL / "tasks"
# A series is one model's full set of runs: EVAL_SERIES=opus writes to results-opus/.
SERIES = os.environ.get("EVAL_SERIES", "sonnet")
RESULTS = EVAL / ("results" if SERIES == "sonnet" else f"results-{SERIES}")
TOOLS = EVAL / ".tools"  # made by setup-tools.sh
# The plugin under test: this repository's own copy, unless ARIADNE_PLUGIN_DIR points elsewhere.
PLUGIN = Path(os.environ.get("ARIADNE_PLUGIN_DIR", EVAL.parent / "plugins/ariadne"))
ARIADNE = PLUGIN / "bin/ariadne"
MODEL = {"sonnet": "claude-sonnet-5-5", "opus": "claude-opus-5-5"}[SERIES]
# The judge is never the model that wrote the code (design.md, Blind judging).
JUDGE_MODEL = {"sonnet": "claude-opus-5-5", "opus": "claude-fable-5-1"}[SERIES]
BUDGET_USD = "4"
REPS = 3
ARMS = ("with", "without")
BASE_TOOLS = ["Read", "Edit", "Write", "Glob", "Grep"]
LANG_TOOLS = {
    "go": ["Bash(go *)", "Bash(gofmt *)"],
    "ts": ["Bash(node *)", "Bash(npm *)"],
    "js": ["Bash(node *)", "Bash(npm *)"],
    "rust": ["Bash(cargo *)", "Bash(rustc *)"],
}
SKIP_DIRS = {".git", "target", "node_modules", ".target"}


def task_info(task):
    info = json.loads((TASKS / task / "task.json").read_text())
    info["name"] = task
    return info


def copy_tree(src, dst):
    shutil.copytree(src, dst, dirs_exist_ok=True, ignore=shutil.ignore_patterns(*SKIP_DIRS))


def sh(cmd, cwd, timeout=900, env=None):
    proc = subprocess.run(cmd, cwd=cwd, shell=isinstance(cmd, str), capture_output=True, text=True,
                          timeout=timeout, env=env)
    return proc.returncode, proc.stdout, proc.stderr


def git_init(repo, message):
    for cmd in (["git", "init", "-q", "-b", "main"], ["git", "add", "-A"],
                ["git", "-c", "user.name=eval", "-c", "user.email=eval@example.com", "commit", "-qm", message]):
        subprocess.run(cmd, cwd=repo, check=True, capture_output=True)


def prepare_repo(task, source):
    work = Path(tempfile.mkdtemp(prefix=f"ariadne-eval-{task['name']}-"))
    copy_tree(source, work)
    if task["language"] in ("ts", "js"):
        (work / "node_modules").mkdir(exist_ok=True)
        (work / ".gitignore").write_text("node_modules/\n")
    if task["language"] == "rust":
        (work / ".gitignore").write_text("target/\n")
    git_init(work, "start")
    return work


def run_claude(repo, prompt, arm, task, log_path):
    cmd = ["claude", "-p", prompt, "--model", MODEL, "--setting-sources", "project,local",
           "--permission-mode", "acceptEdits", "--output-format", "stream-json", "--verbose",
           "--max-budget-usd", BUDGET_USD,
           "--allowedTools", ",".join(BASE_TOOLS + LANG_TOOLS[task["language"]])]
    if arm == "with":
        cmd += ["--plugin-dir", str(PLUGIN)]
    started = time.time()
    with open(log_path, "w") as log:
        proc = subprocess.run(cmd, cwd=repo, stdout=log, stderr=subprocess.PIPE, text=True, timeout=3600)
    wall = time.time() - started
    result, plugins, session = {}, [], None
    for line in open(log_path):
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue
        session = session or event.get("session_id")
        if event.get("type") == "system" and event.get("subtype") == "init":
            plugins = sorted(p.get("name") for p in event.get("plugins", []))
        if event.get("type") == "result":
            result = event
    usage = result.get("usage", {})
    return {
        "exit": proc.returncode, "stderr_tail": proc.stderr[-500:], "wall_s": round(wall, 1),
        "cost_usd": result.get("total_cost_usd"), "turns": result.get("num_turns"),
        "is_error": result.get("is_error"), "subtype": result.get("subtype"),
        "input_tokens": usage.get("input_tokens", 0), "output_tokens": usage.get("output_tokens", 0),
        "cache_read": usage.get("cache_read_input_tokens", 0),
        "cache_creation": usage.get("cache_creation_input_tokens", 0),
        "models": sorted((result.get("modelUsage") or {}).keys()), "plugins": plugins,
        "session": session, "hook_events": hook_events(session),
    }


def hook_events(session):
    """Ariadne's hook outcomes in the saved session transcript: blocks after an edit, blocks at
    the end of the turn, and the final status lines (hook events are not in the stream output)."""
    counts = {"edit_blocks": 0, "stop_blocks": 0, "status_lines": []}
    if not session:
        return counts
    found = list((Path.home() / ".claude/projects").glob(f"*/{session}.jsonl"))
    if not found:
        return counts
    for line in open(found[0]):
        event = _json_or_none(line) or {}
        att = event.get("attachment") if isinstance(event.get("attachment"), dict) else {}
        kind, hook = att.get("type", ""), att.get("hookEvent") or att.get("hookName", "")
        text = json.dumps(att)
        if "Ariadne" not in text and "ariadne" not in text:
            continue
        if kind == "hook_system_message":
            counts["status_lines"].append(att.get("content", ""))
        elif "block" in kind or "error" in kind:
            if "Stop" in hook:
                counts["stop_blocks"] += 1
            else:
                counts["edit_blocks"] += 1
    return counts


def snapshot(repo, dest):
    if dest.exists():
        shutil.rmtree(dest)
    copy_tree(repo, dest)


def test_names(task, files, base):
    names = []
    for rel in files:
        text = (TASKS / task["name"] / base / rel).read_text()
        if task["language"] == "go":
            names += re.findall(r"^func (Test\w+)\(", text, re.M)
        elif task["language"] == "rust":
            names += re.findall(r"#\[test\]\s*(?:#\[[^\]]*\]\s*)*fn (\w+)", text)
        else:
            names += re.findall(r"\b(?:test|it)\(\s*['\"`]([^'\"`]+)", text)
    return names


def run_hidden(task, code_dir, files, base="hidden"):
    """Copy code_dir and the given hidden test files (paths relative to the task's `base` folder,
    which mirror the repository) into a temp dir and count the passing hidden tests."""
    work = Path(tempfile.mkdtemp(prefix="ariadne-eval-test-"))
    try:
        copy_tree(code_dir, work)
        if task["language"] in ("ts", "js"):
            (work / "node_modules").mkdir(exist_ok=True)
        targets = []
        for rel in files:
            src = TASKS / task["name"] / base / rel
            dst = work / rel
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy(src, dst)
            targets.append(dst)
        names = test_names(task, files, base)
        total = len(names)
        lang = task["language"]
        if lang == "go":
            pattern = "^(" + "|".join(names) + ")$"
            code, out, err = sh(["go", "test", "-json", "-count=1", "-run", pattern, "./..."], work)
            passed = {e.get("Test") for e in map(_json_or_none, out.splitlines())
                      if e and e.get("Action") == "pass" and e.get("Test") in names}
            npass = len(passed)
        elif lang == "rust":
            env = dict(os.environ, CARGO_TARGET_DIR=str(work / "target"))
            npass = 0
            for t in targets:
                code, out, err = sh(["cargo", "test", "--quiet", "--test", t.stem], work, env=env)
                m = re.findall(r"test result: \w+\. (\d+) passed; (\d+) failed", out + err)
                npass += sum(int(a) for a, _ in m)
        else:
            code, out, err = sh(["node", "--test", "--test-reporter=tap"] + [str(t) for t in targets], work)
            m = re.search(r"^# pass (\d+)", out, re.M)
            npass = int(m.group(1)) if m else 0
        return {"passed": min(npass, total), "total": total}
    finally:
        shutil.rmtree(work, ignore_errors=True)


def _json_or_none(line):
    try:
        return json.loads(line)
    except json.JSONDecodeError:
        return None


def source_files(task, code_dir):
    lang, out = task["language"], []
    for path in sorted(code_dir.rglob("*")):
        if any(part in SKIP_DIRS for part in path.parts) or not path.is_file():
            continue
        name = path.name
        if lang == "go" and name.endswith(".go") and not name.endswith("_test.go"):
            out.append(path)
        elif lang == "ts" and name.endswith(".ts") and ".test." not in name:
            out.append(path)
        elif lang == "js" and name.endswith(".js") and ".test." not in name:
            out.append(path)
        elif lang == "rust" and name.endswith(".rs") and "tests" not in path.relative_to(code_dir).parts:
            out.append(path)
    return out


def percentile(values, p):
    if not values:
        return 0
    ordered = sorted(values)
    rank = max(1, -(-len(ordered) * p // 100))
    return ordered[int(rank) - 1]


def measure(task, code_dir):
    files = source_files(task, code_dir)
    metrics = {"files": [str(f.relative_to(code_dir)) for f in files]}
    if not files:
        return metrics
    code, out, err = sh([str(TOOLS / "venv/bin/lizard"), "--csv"] + [str(f) for f in files], code_dir)
    rows = [r.split(",") for r in out.strip().splitlines() if r]
    ccn = [int(r[1]) for r in rows]
    nloc = [int(r[0]) for r in rows]
    params = [int(r[3]) for r in rows]
    metrics["lizard"] = {"functions": len(rows), "ccn_max": max(ccn, default=0), "ccn_p90": percentile(ccn, 90),
                         "ccn_over_10": sum(c > 10 for c in ccn), "nloc_total": sum(nloc),
                         "nloc_max": max(nloc, default=0), "params_max": max(params, default=0)}
    lang = task["language"]
    if lang == "go":
        code, out, err = sh([str(TOOLS / "bin/gocognit"), "-json"] + [str(f) for f in files], code_dir)
        stats = json.loads(out or "[]") or []
        cog = [s["Complexity"] for s in stats]
        metrics["cognitive_tool"] = "gocognit"
    elif lang in ("ts", "js"):
        # ESLint ignores files outside its config file's folder: put a temporary config in code_dir.
        config = code_dir / ".eslint.measure.config.mjs"
        template = (TOOLS / "eslint/measure.config.mjs").read_text()
        config.write_text(template.replace("createRequire(import.meta.url)",
                                           f"createRequire({json.dumps(str(TOOLS / 'eslint/package.json'))})"))
        try:
            code, out, err = sh(["node", str(TOOLS / "eslint/node_modules/eslint/bin/eslint.js"), "--config",
                                 config.name, "--format", "json", "--no-warn-ignored"]
                                + [str(f.relative_to(code_dir)) for f in files], code_dir)
        finally:
            config.unlink()
        if not out.strip():
            metrics["cognitive_tool_error"] = (err or "no output")[-300:]
        cog = []
        for result in json.loads(out or "[]"):
            for msg in result.get("messages", []):
                m = re.search(r"Cognitive Complexity from (\d+)", msg.get("message", ""))
                if m:
                    cog.append(int(m.group(1)))
        metrics["cognitive_tool"] = "sonarjs"
    else:
        cog = None
    if cog is not None:
        metrics["cognitive"] = {"max": max(cog, default=0), "p90": percentile(cog, 90),
                                "over_15": sum(c > 15 for c in cog)}
    code, out, err = sh([str(ARIADNE), "check", "--format", "json"] + [str(f) for f in files], code_dir)
    try:
        report = json.loads(out)
        fns = [fn for f in report["files"] for fn in f["functions"]]
        metrics["ariadne"] = {"functions": len(fns), "cognitive_max": max((f["cognitive"] for f in fns), default=0),
                              "over_limits": sum(f["verdict"]["status"] != "pass" for f in fns)}
    except (json.JSONDecodeError, KeyError):
        metrics["ariadne"] = {"error": (out + err)[-300:]}
    return metrics


def run_dir(task_name, arm, rep):
    return RESULTS / task_name / f"{arm}-{rep}"


def first(task_name, arm, rep):
    out = run_dir(task_name, arm, rep)
    if (out / "first.json").exists():
        return
    out.mkdir(parents=True, exist_ok=True)
    task = task_info(task_name)
    repo = prepare_repo(task, TASKS / task_name / "starter")
    try:
        prompt = (TASKS / task_name / "prompt.md").read_text()
        record = {"task": task_name, "arm": arm, "rep": rep, "step": "first"}
        record["run"] = run_claude(repo, prompt, arm, task, out / "first.stream.jsonl")
        snapshot(repo, out / "code")
        record["hidden"] = run_hidden(task, out / "code", task["hidden_files"])
        record["metrics"] = measure(task, out / "code")
        (out / "first.json").write_text(json.dumps(record, indent=1))
        print(f"first  {task_name} {arm}-{rep}: hidden {record['hidden']} cost {record['run']['cost_usd']}", flush=True)
    finally:
        shutil.rmtree(repo, ignore_errors=True)


def follow(task_name, arm, rep):
    out = run_dir(task_name, arm, rep)
    if (out / "follow.json").exists() or not (out / "first.json").exists():
        return
    task = task_info(task_name)
    repo = prepare_repo(task, out / "code")
    try:
        prompt = (TASKS / task_name / "followup.md").read_text()
        record = {"task": task_name, "arm": arm, "rep": rep, "step": "follow"}
        record["run"] = run_claude(repo, prompt, "without", task, out / "follow.stream.jsonl")
        subprocess.run(["git", "add", "-A"], cwd=repo, capture_output=True)
        code, numstat, _ = sh(["git", "diff", "--cached", "--numstat", "HEAD"], repo)
        added = removed = 0
        for line in numstat.splitlines():
            a, r, path = line.split("\t", 2)
            if a != "-":
                added, removed = added + int(a), removed + int(r)
        record["diff"] = {"added": added, "removed": removed}
        snapshot(repo, out / "follow_code")
        replaced = set(task.get("followup_replaces", []))
        kept = [f for f in task["hidden_files"] if f not in replaced]
        record["hidden_follow"] = run_hidden(task, out / "follow_code", task["followup_hidden_files"],
                                             "followup_hidden")
        record["hidden_first_again"] = run_hidden(task, out / "follow_code", kept) if kept else None
        record["metrics"] = measure(task, out / "follow_code")
        (out / "follow.json").write_text(json.dumps(record, indent=1))
        print(f"follow {task_name} {arm}-{rep}: follow {record['hidden_follow']} cost {record['run']['cost_usd']}",
              flush=True)
    finally:
        shutil.rmtree(repo, ignore_errors=True)


def judge_pair(task_name, rep):
    out = RESULTS / task_name / f"judge-{rep}.json"
    if out.exists():
        return
    task = task_info(task_name)
    sides = {}
    for arm in ARMS:
        code_dir = run_dir(task_name, arm, rep) / "code"
        if not code_dir.exists():
            return
        sides[arm] = "\n\n".join(f"// file: {f.relative_to(code_dir)}\n{f.read_text()}"
                                 for f in source_files(task, code_dir))
    rng = random.Random(f"{task_name}-{rep}")
    first_arm = rng.choice(ARMS)
    orders = [(first_arm, other(first_arm)), (other(first_arm), first_arm)]
    verdicts = []
    for a_arm, b_arm in orders:
        prompt = (
            "Two versions of the same module follow, written to the same specification. "
            "Which version would you rather maintain: easier to read, to understand and to change safely? "
            "Judge only the code shown. Reply with a single line of JSON: "
            '{"choice": "A" | "B" | "tie", "reason": "<one sentence>"}\n\n'
            f"=== Version A ===\n{sides[a_arm]}\n\n=== Version B ===\n{sides[b_arm]}\n"
        )
        work = tempfile.mkdtemp(prefix="ariadne-eval-judge-")
        try:
            proc = subprocess.run(["claude", "-p", prompt, "--model", JUDGE_MODEL, "--setting-sources",
                                   "project,local", "--output-format", "json", "--tools", ""],
                                  cwd=work, capture_output=True, text=True, timeout=900)
        finally:
            shutil.rmtree(work, ignore_errors=True)
        result = _json_or_none(proc.stdout) or {}
        text = result.get("result", "")
        m = re.search(r"\{.*\}", text, re.S)
        parsed = _json_or_none(m.group(0)) if m else None
        choice = (parsed or {}).get("choice")
        winner = {"A": a_arm, "B": b_arm}.get(choice, "tie")
        verdicts.append({"A": a_arm, "B": b_arm, "choice": choice, "winner": winner,
                         "reason": (parsed or {}).get("reason", text[:300]), "cost_usd": result.get("total_cost_usd")})
    agreed = verdicts[0]["winner"] if verdicts[0]["winner"] == verdicts[1]["winner"] else "tie"
    out.write_text(json.dumps({"task": task_name, "rep": rep, "verdicts": verdicts, "result": agreed}, indent=1))
    print(f"judge  {task_name} rep {rep}: {agreed}", flush=True)


def other(arm):
    return "without" if arm == "with" else "with"


def validate(task_name):
    """Prove a task and this runner agree: reference passes every hidden test, the starter stub
    fails nearly all, and the follow-up reference passes the follow-up tests and the kept ones."""
    task = task_info(task_name)
    base = TASKS / task_name
    work = Path(tempfile.mkdtemp(prefix="ariadne-eval-validate-"))
    try:
        copy_tree(base / "starter", work / "stub")
        copy_tree(base / "starter", work / "ref")
        copy_tree(base / "reference", work / "ref")
        copy_tree(work / "ref", work / "fref")
        copy_tree(base / "followup_reference", work / "fref")
        kept = [f for f in task["hidden_files"] if f not in set(task.get("followup_replaces", []))]
        report = {
            "stub_hidden": run_hidden(task, work / "stub", task["hidden_files"]),
            "reference_hidden": run_hidden(task, work / "ref", task["hidden_files"]),
            "followref_followup": run_hidden(task, work / "fref", task["followup_hidden_files"], "followup_hidden"),
            "followref_hidden_kept": run_hidden(task, work / "fref", kept) if kept else None,
            "reference_followup": run_hidden(task, work / "ref", task["followup_hidden_files"], "followup_hidden"),
        }
        print(task_name, json.dumps(report))
        return report
    finally:
        shutil.rmtree(work, ignore_errors=True)


def all_tasks():
    return sorted(p.name for p in TASKS.iterdir() if (p / "task.json").exists())


def main(argv):
    if not argv:
        print(__doc__)
        return
    cmd = argv[0]
    opts = {argv[i]: argv[i + 1] for i in range(1, len(argv) - 1) if argv[i].startswith("--")}
    tasks = opts.get("--tasks", ",".join(all_tasks())).split(",")
    reps = int(opts.get("--reps", REPS))
    jobs = int(opts.get("--jobs", 4))
    if cmd == "first":
        first(argv[1], argv[2], int(argv[3]))
    elif cmd == "follow":
        follow(argv[1], argv[2], int(argv[3]))
    elif cmd in ("all", "judge"):
        units = [(t, a, r) for t in tasks for r in range(1, reps + 1) for a in ARMS]
        with concurrent.futures.ThreadPoolExecutor(max_workers=jobs) as pool:
            if cmd == "all":
                for fut in [pool.submit(first, *u) for u in units]:
                    fut.result()
                for fut in [pool.submit(follow, *u) for u in units]:
                    fut.result()
            else:
                for fut in [pool.submit(judge_pair, t, r) for t in tasks for r in range(1, reps + 1)]:
                    fut.result()
    elif cmd == "validate":
        for t in tasks:
            validate(t)
    elif cmd == "table":
        for path in sorted(RESULTS.rglob("first.json")):
            rec = json.loads(path.read_text())
            fol = path.with_name("follow.json")
            frec = json.loads(fol.read_text()) if fol.exists() else {}
            print(rec["task"], rec["arm"], rec["rep"], rec["hidden"], rec["run"]["cost_usd"],
                  rec["metrics"].get("lizard", {}).get("ccn_max"), frec.get("hidden_follow"),
                  (frec.get("run") or {}).get("cost_usd"))
    else:
        print(__doc__)


if __name__ == "__main__":
    main(sys.argv[1:])
