# Counting rules

For a plain-language overview with examples, read [checks.md](checks.md) first. This page
is the exact rule set that Ariadne's tests are written against.

The source of truth for every fixture. The two complexity metrics are computed per
function over abstract constructs; `docs/languages.md` maps each language onto them.
Three code-smell metrics (length, parameters, nesting; see Code smells) are judged
the same way. A function fails a metric when its score is **strictly greater** than
the limit.

## Constructs and increments

Cyclomatic starts at **1** per function; cognitive starts at **0**. `L` is the
nesting level at which the construct appears (see Nesting).

| Construct | Label | Cyclomatic | Cognitive | Raises nesting for |
| --- | --- | --- | --- | --- |
| If | `if` | +1 | +1 + L | its body |
| Else-if | `else if` | +1 | +1 | its body |
| Else | `else` | 0 | +1 | its body |
| Loop (`for`, `for-in/of`, `while`, `do-while`, `loop`) | `loop` | +1 | +1 + L | its body |
| Switch / match / select statement | `switch` | 0 | +1 + L (once) | its cases |
| Case arm (not `default` / `_`) | `case` | +1 | 0 | — |
| Catch clause | `catch` | +1 | +1 + L | its body |
| Conditional expression `a ? b : c` | `conditional` | +1 | +1 + L | its branches |
| Match-arm guard | `guard` | +1 | 0 | — |
| Try operator (where the language rule enables it) | `try operator` | +1 | 0 | — |
| Optional chaining `?.`, counted only when the language rule `count_optional_chaining` is on | `optional chain` | +1 | 0 | — |
| Logical operator sequence | `<ops> sequence` | +1 per operator | +1 per run of like operators | — |
| Labelled `break` / `continue` | `labeled jump` | 0 | +1 | — |
| `goto` | `goto` | 0 | +1 | — |
| Anonymous function (closure, lambda, arrow, func literal) | — | 0 | 0 | its body |

Not counted: `try`, `finally`, `default` / `_` arms, plain `return`, unlabelled
`break`/`continue`, recursion (v1).

## Nesting

- Nesting starts at **0** at the top of a function body.
- A construct's **header** (condition, loop clause, switch subject, initializer)
  is evaluated at the construct's own level `L`. Only its **body** is at `L + 1`.
- `else if` and `else` sit at the **same** level as their `if`; their bodies are at `L + 1`.
  An else-if chain therefore never deepens nesting by itself.
- Cases of a switch are at `L + 1` relative to the switch (so an `if` inside a
  case of a top-level switch has `L = 1`).
- Anonymous function bodies are at `L + 1` and add no increment themselves.
- Named functions declared inside another function are separate functions:
  they start at level 0 and add nothing to the enclosing function.

Example (Go-like):

```go
func f(xs []int, ok bool) {
    for _, x := range xs {      // loop    L0  cog +1        cyc +1
        if x > 0 && ok {        // if      L1  cog +2        cyc +1
                                // && sequence  cog +1       cyc +1
        } else if x < 0 {       // else if     cog +1        cyc +1
        } else {                // else        cog +1
        }
    }
}
// cyclomatic = 1 + 4 = 5, cognitive = 6
```

## Logical operator sequences

- A **logical expression** is a maximal tree of binary logical operators
  (`&&`, `||`, and `??` where the language rule enables it), looking through
  parentheses. Anything else (unary `!`, calls, comparisons, closures) ends the
  tree; logical expressions inside it are separate sequences.
- A logical operator that the language rule disables (e.g. `??` with `count_nullish_coalescing = false`) is not logical: it ends the tree like any other expression.
- Write the operators in source order. Cognitive is **+1 for the first operator
  and +1 each time an operator differs from the one before it**. Cyclomatic is
  **+1 per operator**.
- One increment is recorded per logical expression, labelled with its runs of
  operators joined by spaces plus ` sequence`, e.g. `&& sequence`, `&& || sequence`.

| Expression | Operators | Label | Cognitive | Cyclomatic |
| --- | --- | --- | --- | --- |
| `a && b` | `&&` | `&& sequence` | 1 | 1 |
| `a && b && c` | `&& &&` | `&& sequence` | 1 | 2 |
| `a && b \|\| c` | `&& \|\|` | `&& \|\| sequence` | 2 | 2 |
| `a \|\| b && c` | `\|\| &&` | `\|\| && sequence` | 2 | 2 |
| `a && b \|\| c && d` | `&& \|\| &&` | `&& \|\| && sequence` | 3 | 3 |
| `a && (b && c)` | `&& &&` | `&& sequence` | 1 | 2 |
| `a && !(b \|\| c)` | `&&` and, separately, `\|\|` | `&& sequence` + `\|\| sequence` | 2 | 2 |

## Function boundaries

Named functions and methods are reported separately with a qualified name
(`Type.method`; plain `name` for free functions). Anonymous functions roll into
the enclosing function. Exception: in JS/TS an arrow function or function
expression bound directly to a top-level `const`/`let`/`export` is its own
function, named after the binding; TypeScript also reports class fields holding
one, top-level object members and top-level callbacks (see `docs/languages.md`).
Other anonymous functions outside any named function (e.g. at file top level) are
not reported.

A reported function's start line is the line of its first token (the function keyword, receiver or modifiers; leading doc comments are excluded, and so are decorators and attributes: a decorated TypeScript method starts at its own first token, not at its `@Decorator` lines; a TypeScript function bound to a name starts at its declaration, `export` or `const`, as `docs/languages.md` details) and its end line is the line of its last token (normally the closing brace). Functions with the same name (e.g. several Go `init` functions) are all reported, ordered by start line, then name. Named functions declared inside another function are reported separately, qualified as each language module documents in `docs/languages.md`.

## Increments

Every counted construct produces one increment record: `line`, `construct` (the label above), `cognitive`, `cyclomatic`, and `nesting`.
- `line`: the 1-based line of the construct's introducing token — `if` (also for an else-if), `else`, the loop keyword (or the loop's label when one precedes it, as in Rust's `'outer: for`), `switch`/`match`/`select`, `case`, `catch`, the conditional's `?`, `goto`, `break`/`continue`, a match guard's `if` (a guard on its own line is recorded there, not on its arm's line); a try operator's `?` (on a multi-line call, the line of the `?`, not of the call); an optional chain's `?.`; for a logical sequence, its first operator in source order.
- `nesting`: the level `L` of the position where the construct itself sits. A case sits inside its switch, so its record has the switch's `L + 1`. A logical sequence takes the level of the header or body it appears in (a sequence in an `if` condition has the `if`'s `L`). A conditional's condition is at its `L` and its branches at `L + 1`, as in SonarJS (`languages.md`, TypeScript, Cross-validation).
- Records are ordered by line. On one line, a construct comes before the constructs in its header and body, even when its token comes later (a TypeScript conditional's `?` after an `&&` in its condition: `conditional`, then `&& sequence`). A function's scores are the base plus the sum of its increments.

## Code smells

Three per-function scores beside the complexity metrics. Each is judged exactly
like them: a limit per metric (`[thresholds]`, `[languages.<lang>]`,
`[[overrides]]`), failing when the score is strictly greater, with the same modes,
exemptions, ratchet and debt. Defaults, for every language: length 80, parameters
7, nesting 4. None has per-line increments.

| Metric | Config key | Score |
| --- | --- | --- |
| Length | `length` | `end − start + 1`: the physical lines of the reported function's span (see Function boundaries), blank and comment lines included. The span includes every function nested inside it (closures and named nested functions, such as a Rust `fn` inside a `fn`), so extracting a helper only shortens its parent when the helper moves out of the parent's body |
| Parameters | `parameters` | The reported function's declared parameters, receiver / `self` excluded; each language's rule is in `docs/languages.md` |
| Nesting | `nesting` | `1 +` the deepest level `L` (see Nesting) of any `if`, `else if`, `else`, loop, switch, catch or conditional; `0` when the function has none |

Nesting details:

- The levels are the cognitive engine's: a construct at the top of the body is at
  `L = 0` and scores nesting `1`. An else-if chain stays at its `if`'s level, so
  `if … else if … else` at the top scores `1`.
- Not counted themselves: case arms, match guards, logical operator sequences,
  labelled jumps, `goto`, try operators, optional chains and anonymous functions.
  An anonymous function still deepens what is inside it, exactly as in cognitive:
  an `if` inside a closure inside a loop is at `L = 2` and scores `3`.
- Rust `let … else` is an `if` (see `docs/languages.md`, R5), so its else block is
  one level deeper:

  ```rust
  fn f(v: Option<i32>) {
      let Some(x) = v else {   // if   L0 -> nesting 1
          if x_missing() {     // if   L1 -> nesting 2
              return;
          }
          return;
      };
  }
  // nesting = 2, nesting_line = the inner `if`
  ```
- A rule that leaves a construct uncounted (Go's `count_err_check = false`) also
  leaves it out of nesting.
- The report also records `nesting_line`: the line of the first construct, in
  source order, at the deepest level (`null` when nesting is `0`).

Closures are not reported functions, so they have no length or parameter count of
their own; their lines count toward the enclosing function's length.
