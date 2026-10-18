# Task contract (every task folder follows it exactly)

evaluation/tasks/<task>/
  task.json            {"language": "go|ts|js|rust", "test_cmd": "...", "result_parser": "go-json|node-tap|cargo",
                        "allowed_tools": [...], "hidden_files": [...], "followup_hidden_files": [...]}
  prompt.md            the exact first-task prompt given to Claude (complete, precise spec; no mention of
                       complexity, style, refactoring, Ariadne or hidden tests). Ends by naming the visible
                       test file and the command that runs it.
  starter/             the repository Claude starts from: build files, types, a stub that COMPILES and
                       returns zero values / throws "not implemented", 2-4 visible tests (they fail on the stub).
                       No dependencies beyond the standard library / standard toolchain (offline).
  hidden/              hidden test files, copied into the repo (same relative paths) only for evaluation.
                       15-30 independent, individually named test cases that pin the spec, incl. edge cases.
  reference/           a full reference solution (files overlaid onto starter/). Passes visible + hidden.
                       Written plainly; it is never shown to Claude.
  followup.md          the exact follow-up prompt (a realistic change request to the finished code).
  followup_hidden/     hidden tests for the follow-up (8-15 cases). The first task's hidden tests must
                       still pass after the follow-up, unless the follow-up spec changes that behaviour
                       (then say which tests are replaced, in task.json "followup_replaces").
  followup_reference/  reference after the follow-up (overlaid onto reference/). Passes visible + hidden +
                       followup_hidden.
  VALIDATION.md        the commands you ran and their output summary proving: reference passes all;
                       starter stub fails nearly all hidden tests; follow-up reference passes all.

Languages:
- go:   module example.com/<task>, `go test -json ./...` (result_parser go-json counts top-level Test* pass/fail).
- ts:   Node 25 runs .ts directly (type stripping). package.json {"type":"module","scripts":{"test":"node --test"}},
        tests are *.test.ts using node:test and node:assert/strict, imports use the .ts extension.
        test_cmd: `node --test --test-reporter=tap`. No npm dependencies, no tsconfig needed.
- js:   same as ts with .js files (ES modules).
- rust: a library crate (edition 2021, no dependencies), visible tests in tests/visible.rs, hidden in
        tests/hidden.rs and tests/followup_hidden.rs; test_cmd `cargo test --quiet`.
