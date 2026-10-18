# ts-signup validation (2026-10-18, Node v25.8.2, offline, no dependencies)

Each check assembles a fresh directory in the session scratchpad by overlaying the task folders
(`cp -R <dir>/. <work>/`) in the order listed, then runs `node --test --test-reporter=tap` in it.

| Overlay | Tests run | Result |
|---|---|---|
| starter + hidden (stub) | visible 3 + hidden 30 = 33 | pass 0, fail 33 |
| starter (stub), `src/signup.test.ts` only | 3 | pass 0, fail 3 |
| starter + reference + hidden | 33 | pass 33, fail 0 |
| starter + reference + followup_reference + hidden + followup_hidden | 3 + 30 + 14 = 47 | pass 47, fail 0 |
| starter + reference + hidden + followup_hidden (first-task reference, no follow-up) | 47 | pass 39, fail 8 |

The stub throws "not implemented", so every visible and hidden test fails on it.

The first-task reference fails 8 of the 14 follow-up tests. The 6 it passes check behaviour that
must stay the same: no phone given, a phone skipped for an invalid country, a phone valid under the
"any other country" rule, `contains_email` winning, earlier password rules winning, and an invalid
or reserved username not checked against the password. The 8 failures are the new phone rules and
`contains_username`. No first-task hidden test is replaced by the follow-up (`followup_replaces` is
not needed): all 30 still pass with the follow-up reference.

Commands (where `$S` is the scratchpad work directory):

```
cd $S/stub && node --test --test-reporter=tap   # tests 33, pass 0, fail 33
cd $S/ref  && node --test --test-reporter=tap   # tests 33, pass 33, fail 0
cd $S/fu   && node --test --test-reporter=tap   # tests 47, pass 47, fail 0
cd $S/fustub && node --test --test-reporter=tap # tests 47, pass 39, fail 8
```
