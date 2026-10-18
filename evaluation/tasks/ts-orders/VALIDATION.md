# ts-orders validation (2026-10-18, Node v25.8.2, offline)

Each check copies the folders named into a fresh scratch directory (overlay order as listed)
and runs `node --test --test-reporter=tap` there.

| Check | Overlay | Result |
|---|---|---|
| Starter alone (visible tests) | starter | tests 3, pass 0, fail 3 |
| Starter stub vs hidden | starter + hidden | tests 31, pass 1, fail 30 (only `OrderError has name OrderError and its code` passes: the class ships in the starter) |
| Reference | starter + reference + hidden | tests 31, pass 31, fail 0 |
| Follow-up reference, everything | starter + reference + followup_reference + hidden + followup_hidden | tests 44, pass 44, fail 0 |
| Stub vs hidden + follow-up hidden | starter + hidden + followup_hidden | tests 44, pass 1, fail 43 |
| First reference vs follow-up hidden (sanity: follow-up tests need the follow-up) | starter + reference + followup_hidden | tests 16, pass 5 (3 visible + 2 follow-up), fail 11 |

Counts: visible 3, hidden 28, follow-up hidden 13. `followup_replaces` is not needed: every
first-task hidden test still passes after the follow-up.

The two follow-up tests that pass on the first reference (`hold and review never mutate the
input order`, `history records the full held path`) do so because that reference silently
ignores unknown event types; they still pin follow-up behaviour for a real implementation.

Commands (S = scratch dir, T = this folder), e.g.:

    mkdir -p $S/ref2 && cp -R $T/starter/. $S/ref2/ && cp -R $T/reference/. $S/ref2/ \
      && cp -R $T/hidden/. $S/ref2/ && cd $S/ref2 && node --test --test-reporter=tap \
      | grep -E "^(not ok|# (tests|pass|fail))"
