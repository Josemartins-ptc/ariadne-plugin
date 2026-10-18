# js-markdown validation

Node v25.8.2, offline, no dependencies. Each check overlays folders into a fresh scratch copy and runs the
task's `test_cmd` (`node --test --test-reporter=tap`), reading the TAP summary lines.

| Check | Overlay (in order) | Result |
|---|---|---|
| Reference passes visible + hidden | starter, reference, hidden | tests 33, pass 33, fail 0 |
| Stub fails hidden | starter, hidden (visible file removed) | tests 30, pass 0, fail 30 |
| Stub fails visible | starter | tests 3, pass 0, fail 3 |
| Follow-up reference passes everything | starter, reference, followup_reference, hidden, followup_hidden | tests 48, pass 48, fail 0 |
| Follow-up hidden against the first-task reference | starter, reference, followup_hidden | tests 18, pass 5, fail 13 |

The last row is a sanity check: 13 of the 15 follow-up hidden tests need the new features. The other 2
(`greater-than without a space is paragraph text`, `a backtick line with two words is not a fence`) guard old
behaviour that must survive the follow-up, so they pass before it too. `followup_replaces` is empty: no
first-task hidden test starts a line with `> ` or ` ``` `, so all 30 still pass after the follow-up.

The worked examples in `prompt.md` and `followup.md` were run through the references and match byte for byte.

Commands (S = scratch dir, T = this folder):

```
cp -R $T/starter/. $S/ref/; cp -R $T/reference/. $S/ref/; cp -R $T/hidden/. $S/ref/
cd $S/ref && node --test --test-reporter=tap        # 33/33 pass

cp -R $T/starter/. $S/stub/; cp -R $T/hidden/. $S/stub/; rm $S/stub/src/markdown.test.js
cd $S/stub && node --test --test-reporter=tap       # 0/30 pass (stub throws "not implemented")

cp -R $T/starter/. $S/fu/; cp -R $T/reference/. $S/fu/; cp -R $T/followup_reference/. $S/fu/
cp -R $T/hidden/. $S/fu/; cp -R $T/followup_hidden/. $S/fu/
cd $S/fu && node --test --test-reporter=tap         # 48/48 pass
```
