# go-pricing validation (2026-10-18, go1.26.5 darwin/arm64)

Each run assembles a fresh directory in the scratchpad by overlaying folders in order, then runs
`go test -json ./...` and counts top-level `Test*` pass/fail events (subtests excluded), as the go-json parser does.

| Run | Overlay | `go vet` | Result |
|-----|---------|----------|--------|
| Reference | starter + reference + hidden | clean | **33 pass / 0 fail** (3 visible + 30 hidden) |
| Stub | starter + hidden | - | **0 pass / 33 fail** (every hidden and visible test fails: the stub returns `errNotImplemented`) |
| Starter alone | starter | - | 0 pass / 3 fail (visible tests fail on the stub) |
| Follow-up reference | starter + reference + followup_reference + hidden + followup_hidden | clean | **47 pass / 0 fail** (3 visible + 30 hidden + 14 follow-up hidden) |
| First reference vs follow-up tests | starter + reference + hidden + followup_hidden | - | build fails (`unknown field GiftCardBalance` / `GiftCardUsed`): the follow-up tests require the follow-up change |

All expected numbers in hidden/ and followup_hidden/ were derived by hand from prompt.md / followup.md
(derivations are in the test comments for non-obvious cases) before running the reference; the reference matched
every one on the first run. `gofmt -l` reports nothing. No test from the first task is replaced by the follow-up
(`followup_replaces` is empty).
