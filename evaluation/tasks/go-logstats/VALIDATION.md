# go-logstats validation

Run on go1.26.5 darwin/arm64, offline, standard library only. Each check copies the
listed folders, in order, into a fresh empty directory and runs `go test -json ./...`.
Counts are top-level `Test*` pass/fail events (the go-json parser's rule).

| Check | Folders overlaid | Exit | Pass | Fail |
|---|---|---|---|---|
| Stub, visible only | starter | 1 | 0 | 3 |
| Stub + hidden | starter, hidden | 1 | 1 | 30 |
| Reference + hidden | starter, reference, hidden | 0 | 31 | 0 |
| Follow-up reference + all | starter, reference, followup_reference, hidden, followup_hidden | 0 | 44 | 0 |
| First reference + follow-up hidden | starter, reference, hidden, followup_hidden | 1 | build failed (no `Filter`/`AnalyzeFiltered`/`ByMethod`), as expected |

- Test counts: visible 3, hidden 28, follow-up hidden 13.
- The only hidden test the stub passes is `TestHiddenOnlySkippedLines` (zero values are the right
  answer for an all-skipped input); 27 of 28 hidden tests fail on the stub.
- `go vet ./...` clean on the reference and follow-up reference trees; `gofmt -l` reports nothing
  for any folder.
- First-task hidden tests compare `Stats` field by field (never the whole struct), so they still
  compile and pass after the follow-up adds `ByMethod`; `followup_replaces` is empty.
- Two expected values in the follow-up hidden tests were wrong in the first draft (a line number
  miscounted, a time-zone instant that fell inside the window); both were corrected against the
  spec by hand, not by copying the reference's output.
