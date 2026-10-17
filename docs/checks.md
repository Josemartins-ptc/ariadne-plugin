# What Ariadne checks

Ariadne looks at every function the agent writes or changes, and gives it five scores.
If one score is above its limit, the agent has to fix the function before it can stop.

| Score | What it measures | Default limit | Usual fix |
|---|---|---|---|
| Cyclomatic | How many paths run through the function | Go 15, Rust and TypeScript 10 | Split decisions into smaller functions |
| Cognitive | How hard the function is to read; nested code costs more | 15 | Return early, extract the nested part |
| Length | Lines, from the first line of the function to the last | 80 (`.tsx` 120, tests 150) | Move steps into their own functions |
| Parameters | How many parameters it takes | 7 | Group related parameters into a struct |
| Nesting | How deep `if`s, loops and `switch`/`match` go | 4 | Return early, extract the inner block |

A score equal to the limit passes. You can change every limit: see
[configuration.md](configuration.md).

At the end of a turn Ariadne also runs your **lint** and **tests** (for example `go vet`
and `go test`, or `cargo clippy` and `cargo test`; for TypeScript, each package's
type-check and unit test scripts: see
[languages.md](languages.md#lint-and-test-commands)). See [how-it-works.md](how-it-works.md).

## Complexity

### Cyclomatic

Each `if`, loop, `case` and `&&` / `||` adds one path. A function with no branches
scores 1.

```go
func grade(score int) string {   // 1
    if score >= 90 {             // +1
        return "A"
    } else if score >= 75 {      // +1
        return "B"
    }
    return "C"
}                                // cyclomatic 3
```

### Cognitive

Like cyclomatic, but code inside other code costs more: an `if` at the top costs 1, an
`if` inside a loop costs 2, an `if` inside that costs 3. This is why deeply nested code
fails quickly, and why returning early or extracting the inner part fixes it.

```go
for _, row := range rows {       // +1
    if row.Valid {               // +2 (nesting 1)
        for _, c := range row.C {// +3 (nesting 2)
            if c > max {         // +4 (nesting 3)
                max = c
            }
        }
    }
}                                // cognitive 10
```

`ariadne explain file.go:Func` lists every point a function scored, line by line.

## Code smells

These do not measure branches, so a function with no `if` at all can still fail them.

### Length

The number of lines from the function's first line to its last, blank and comment lines
included. A function nested inside another (a closure, or a Rust `fn` inside a `fn`)
counts toward the outer one, so moving code into a nested function does not make the
outer one shorter. Moving it out does.

In a `.tsx` file the limit is 120: a component laid out in JSX takes more lines than
other code. `.ts` files keep 80.

Test functions get at least 150 lines, because table-driven tests are long on purpose.

### Parameters

The parameters a function declares. The receiver of a Go method, Rust's `self` and a
TypeScript `this:` parameter do not count. In Go, `a, b int` is two parameters. In
TypeScript a destructured parameter (`{ a, b }: Props`) is one.

### Nesting

How deep the deepest `if`, `else`, loop, `switch`/`match`/`select` or `catch` sits,
counting from 1. An `if … else if … else` chain stays at one level. A closure makes the
code inside it one level deeper. The report says on which line the deepest block starts.

```go
func walk(nodes []Node) {
    for _, n := range nodes {          // 1
        if n.Open {                    // 2
            for _, c := range n.Kids { // 3
                if c.Bad {             // 4
                    log(c)
                }
            }
        }
    }
}                                      // nesting 4: passes; one more level fails
```

## Test code

Test functions have their own section in `.ariadne.toml`, `[test_code]`. By default only
the length limit differs: at least 150 lines. Ariadne treats as test code:

- **Go:** every function in a `_test.go` file;
- **Rust:** functions in a `#[cfg(test)]` module, functions marked `#[test]` or
  `#[tokio::test]`, and every function under a `tests/` folder;
- **TypeScript:** every function in a file named like `cart.test.ts`, `api.spec.ts`,
  `app.e2e-spec.ts`, `app.e2e.ts`, `db.integration-test.ts` or `Button.cy.tsx` (any
  TypeScript extension), and every function under a folder named `__tests__`,
  `__mocks__`, `test`, `tests`, `testing` or `e2e`. Each `it` or `test` callback is
  judged as its own function (`it("adds")`); a `describe` that only groups them is not.

Details: [configuration.md](configuration.md#test-code).

## Which functions are checked

By default only functions the agent changed (and every function in a new file). Old code
it did not touch does not block it. Other modes, such as `ratchet`, which lets an old
function stay over a limit as long as it does not get worse, are in
[configuration.md](configuration.md#modes).

The exact counting rules, used by Ariadne's own tests, are in [metrics.md](metrics.md)
and [languages.md](languages.md).
