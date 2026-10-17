# Language mappings

Each language module in `ariadne-lang` maps tree-sitter node kinds onto the
constructs in `metrics.md`. Every judgment call is a named rule in
`.ariadne.toml` with the default listed here. Systematic differences from
reference tools are recorded per language after cross-validation.

## Go — `tree-sitter-go` 0.25.0

| Construct | Node kinds / shape |
| --- | --- |
| Named function | `function_declaration` (`name`); `method_declaration` (`name`, qualified by the receiver type: `receiver` → `parameter_declaration` → `type`, unwrapping `pointer_type` and `generic_type`) |
| Anonymous function | `func_literal` |
| If | `if_statement` (`initializer` and `condition` are header; `consequence` is body) |
| Else-if / else | the `alternative` field of `if_statement`: an `if_statement` (else-if) or a `block` (else). An else-if increment is recorded on the line of its `if` keyword; an else increment on the line of its `else` keyword. |
| Loop | `for_statement` (all forms: three-clause, condition-only, `range`, infinite) |
| Switch | `expression_switch_statement`, `type_switch_statement`, `select_statement` |
| Case | `expression_case`, `type_case`, `communication_case`; `default_case` not counted. One increment per case clause, however many values it lists (`case 1, 2:` is one increment). |
| Logical operators | `binary_expression` whose `operator` is `&&` or `\|\|`; `parenthesized_expression` is looked through |
| Labelled jump | `break_statement` / `continue_statement` with a `label_name` child |
| Goto | `goto_statement` |
| Test code | every function in a file whose name ends in `_test.go` (the file name only; a folder named `tests` does not count). Test functions are judged against `[test_code]` (see `configuration.md`). |
| Test companion | a failing lint or test output that names `x_test.go` names `x.go` in the same folder, for a subagent sharing a lint or test run with another agent (see `how-it-works.md`, Subagents). |
| Progress lines | a line starting `ok ` (`ok  \texample.com/m\t0.01s`, a passing package) is never read for file names when a shared lint or test failure is attributed (see `how-it-works.md`, Subagents). |
| Parameters | the `parameters` field (`parameter_list`) of the function or method: each `parameter_declaration` counts its `name` fields (`a, b int` is 2), or 1 when it has none (`func(int, string)` is 2); each `variadic_parameter_declaration` counts 1 (`rest ...string`, `...int`). Not counted: the method `receiver` (another field), type parameters (`type_parameters`, `[T any]`), and the parameters inside a function-typed parameter's type (`f func(a, b int) int` is 1). |

Judgment calls:

| Rule | Default | Effect when `false` |
| --- | --- | --- |
| `count_err_check` | `true` | When `false`, an `if` statement with no else branch whose condition is exactly `err != nil` (left operand the identifier `err`, right operand `nil`) adds nothing to either metric, produces no increment record and does not raise nesting: its body is analysed at the enclosing level. An initializer (`if err := f(); err != nil`) is allowed. Counted normally: any `if` with an else branch, `else if err != nil` inside a chain, `err == nil`, `nil != err`, `errors.Is(...)` and any compound condition such as `err != nil && ok`. Parentheses are not looked through: `if (err != nil)` is counted normally (gofmt removes such parentheses). |
| `select` cases | count like `switch` cases | (not configurable) |

### Cross-validation

Run with `scripts/crossval_go.py` (Ariadne built-in defaults, so `count_err_check = true`)
against `gocyclo` v0.6.0 and `gocognit` v1.3.0 (`-over -1`, default syntactic recursion
detection) on the Go 1.26.5 standard library. The script copies each corpus to a temp
dir, skipping `testdata`, `vendor` and `_`/`.`-prefixed directories (which `gocyclo`
skips), and compares cognitive scores increment by increment with `gocognit -d`, so
offsetting differences cannot hide in an equal total.

| Corpus | Functions (Ariadne / gocyclo / gocognit) | Cyclomatic differences | Cognitive differences | Unexplained |
| --- | --- | --- | --- | --- |
| `net/http` | 2,906 / 2,908 / 2,906 | 2 | 7 | 0 |
| `text/template` | 443 / 443 / 443 | 0 | 3 | 0 |
| `encoding/json` | 1,236 / 1,238 / 1,236 | 2 | 31 | 0 |
| all of `src` | 68,661 / 68,704 / 68,661 | 43 | 820 | 0 |

Every difference belongs to one of these classes:

- **Recursion** (cognitive; Ariadne lower by 1): `gocognit` adds +1 to a function that
  calls itself or is in a mutually recursive cycle; recursion is not counted in v1
  (`metrics.md`, "Not counted"). Example: `text/template/exec.go:261` `state.walk`
  (Ariadne 7, gocognit 8). 820 functions in all of `src`.
- **Package-level func literal** (cyclomatic; reported only by `gocyclo`): `gocyclo` reports
  `var x = func() {…}`; Ariadne reports no anonymous function outside a named function
  (`metrics.md`, Function boundaries; `decisions.md` 2026-10-12). `gocognit` agrees with
  Ariadne. Example: `encoding/json/internal/jsonopts/options.go:68` `GetUnknownOption`.
- **Logical operators under `==` / `!=`** (cognitive): `gocognit` collects one operator
  sequence through any binary expression; `metrics.md` ends a logical expression at a
  comparison, and the logical expressions inside it are separate sequences. So
  `a && (b || c) == d && e` is `&& sequence` + `|| sequence` (2) for Ariadne but one
  `&& || &&` run (3) for `gocognit`, while `a && (b && c) == d` is 2 for Ariadne and 1 for
  `gocognit`. In Go only `==`/`!=` can take a logical operand, and it must be
  parenthesised. One occurrence in all of `src`: `encoding/gob/decode.go:1017`
  `Decoder.compatibleType` (Ariadne 22, gocognit 24: +1 recursion, and its logical
  sequences score 10 against Ariadne's 9).

No other differences: `if`, `else if` (+1, flat), `else`, loops, `switch`/type switch/`select`
(+1 + L once; cases nest), cases (+1 cyclomatic each, `default` excluded), logical
sequences through parentheses and ending at `!` and calls, labelled `break`/`continue`,
`goto`, and func-literal nesting agree increment by increment. All of `src` exercises every
Go construct (544 `goto`, 346 labelled jumps, 2,239 `else if`, 1,947 mixed-operator
sequences).

A second, looser check (2026-10-13) used `lizard` 1.24.1 (`-Ecognitive`) on the Go fixtures
plus the top-level files of `net/http`, matching functions by name, start and end line
(1,646 matched). Cyclomatic is identical for 81% (correlation 0.91), cognitive for 79%
(0.76). Where they differ, Ariadne is higher in every function for cyclomatic and in all
but 7 for cognitive. Ariadne ran with its defaults (`count_err_check = true`), so
`if err != nil` counts as an ordinary `if`, as it does in `lizard`. The largest differences, inspected one by one, come from `lizard`'s
token-based reader: it reports every func literal as a function of its own, so their
increments leave the enclosing function (tests built from `t.Run(func…)` differ most), and
it misreads some boundaries (`Server.maxHeaderBytes`, 6 lines, read as 897–1536). The
smaller differences were not analysed individually. `gocognit` above stays the reference
for Go.

## Rust — `tree-sitter-rust` 0.24.2

| Construct | Node kinds / shape |
| --- | --- |
| Named function | `function_item` (`name`). Qualified as `Type.method` only when its parent is the `declaration_list` (`body`) of an `impl_item` or a `trait_item` (see naming below). `function_signature_item` (a trait method without a body, an `extern` block declaration) is not reported. |
| Anonymous function | `closure_expression` (an `async` closure too): rolls into the enclosing function; a closure outside every function (`const F: fn() = \|\| {};`) is not reported |
| If | `if_expression` (`condition` is header, including an `if let` `let_condition` (R6); `consequence` is body). `let PATTERN = value else { … }` (a `let_declaration` with an `alternative` block) is an `if` too (R5): the pattern, type and value are header, the else block is the body; the increment is on the `let` line. A `let` without `else` is not a construct. |
| Else-if / else | the `alternative` field of `if_expression`, an `else_clause` whose child is an `if_expression` (else-if, recorded on its `if`) or a `block` (else, recorded on the `else` keyword) |
| Loop | `for_expression`, `while_expression` (`while let` too, R6), `loop_expression`: the `body` field is the body, every other child (label, pattern, iterable, condition) the header. A loop label adds nothing; a labelled loop's increment is on its first token, the label. |
| Switch | `match_expression`: `value` is the header, the `match_arm`s of its `match_block` are the body |
| Case | `match_arm`, one increment per arm (`A \| B =>` is one), recorded on its pattern's line (after any `#[…]` attributes). An arm whose pattern starts with the wildcard token `_` (`_ =>`, `_ if c =>`) adds no case (R4); `(_, _) =>`, `Some(_) =>` and a binding `x =>` are cases. |
| Guard | the `condition` field of `match_pattern` (`Some(n) if n > 0 =>`): +1 cyclomatic, recorded on the line of its `if` token (R11), whatever the pattern |
| Labelled jump | `break_expression` / `continue_expression` with a `label` child, including `break 'block value` out of a labelled block; unlabelled `break` / `continue` add nothing |
| Logical operators | `binary_expression` whose `operator` is `&&` or `\|\|`; `let_chain` (R7), whose operands are its named non-comment children (`let_condition`s and expressions) and whose operators are the anonymous `&&` tokens between them. Both flatten together, looking through `parenthesized_expression`. The `\|` delimiters of `closure_parameters` are never operators. |
| Try operator | `try_expression`, only with `count_try_operator = true` (R8): `try operator`, recorded on the line of its `?` token (R11) |
| Macros | `macro_invocation` and `macro_definition` (`macro_rules!`) are opaque (R9): their `token_tree`s hold only tokens, never expressions, so nothing inside them counts (`assert!(a && b)`, `vec![if x { 1 } else { 2 }]`, `tokio::select! { … }` add 0) and they never mark the file incomplete |
| Blocks | `unsafe`, `async`, `const` and labelled blocks are transparent: no increment, no nesting (R10) |
| Parameters | the `parameter` children of the function's `parameters` field; a pattern parameter (`(a, b): (i32, i32)`) counts 1, and an attribute on a parameter (`#[allow(…)] a: i32`) changes nothing. Not counted: `self_parameter` (`self`, `mut self`, `&self`, `&'a self`, `&mut self`), a typed receiver (a `parameter` whose `pattern` is `self`, as in `self: Box<Self>`), generic parameters, the C-variadic `...` (`variadic_parameter`) and the parameters inside a parameter's type (`f: impl Fn(i32, i32)` is 1). Known limit: `#[cfg]` is not evaluated, so parameters behind alternative `#[cfg]` attributes (`#[cfg(unix)] fd: i32, #[cfg(windows)] h: isize`) are each counted. |
| Test code | a `function_item` is test code (judged against `[test_code]`, see `configuration.md`) when: an enclosing `mod_item` (at any depth) has an outer attribute that is exactly `cfg(test)` (spacing ignored; `cfg(not(test))`, `cfg(all(test, …))` and `cfg(test)` on anything but a module do not count); it or an enclosing `function_item` has an outer attribute whose path is `test` or ends in `::test` (`#[test]`, `#[tokio::test]`, `#[tokio::test(flavor = "multi_thread")]`); or the file's path, relative to the repository root, has a folder named `tests` (`tests/check.rs`, `crates/x/tests/support/mod.rs`; `src/tests.rs` does not count). Outer attributes are the `attribute_item` siblings right before the item, comments between them skipped. Outside a git repository the path is relative to where Ariadne runs. Known limits: an inner `#![cfg(test)]` and a module file declared elsewhere as `#[cfg(test)] mod tests;` (its `src/tests.rs`) are not recognised; `#[rstest]`, `#[test_case]`, `#[wasm_bindgen_test]` and `#[quickcheck]` are recognised only inside a `#[cfg(test)]` module or a `tests/` folder. |
| Test companion | none: unit tests live in the source file, so a failing output names a source only directly (see `how-it-works.md`, Subagents). |
| Progress lines | a line starting `Running ` (`Running unittests src/lib.rs (…)`) or `Doc-tests ` is never read for file names when a shared lint or test failure is attributed (see `how-it-works.md`, Subagents). |

Naming (decisions 2026-10-13, R1–R3):

- **R1, method qualifier.** A method in `impl T { … }` or `impl Trait for T { … }` is `T.method`, joined with `.` as for Go. The qualifier is the `impl_item` `type` field, unwrapped through `generic_type` → `type` (`Stack<T>` → `Stack`, `Parser<'a>` → `Parser`), `scoped_type_identifier` → `name` (`fmt::Order` → `Order`) and `reference_type` → `type` (`&'a mut Order` → `Order`); any other type is named by its text (`impl Trait for [u8]` → `[u8].m`), with each run of whitespace in that text collapsed to one space (`impl Foo for (A,\n B)` → `(A, B).m`). The trait of a trait impl is not part of the name: `impl fmt::Display for Order { fn fmt }` is `Order.fmt`, and duplicate names are reported in line order. A trait's own default methods use the `trait_item` `name`: `trait Shape { fn describe(&self) { … } }` is `Shape.describe`.
- **R2, nested items.** Only a function whose parent is an `impl`'s or a trait's `declaration_list` is qualified. A `fn` declared inside another function's body (including a method's) is a separate function with its bare name; an `impl` inside a function body still qualifies its methods (`impl Local { fn m() }` → `Local.m`). `mod` never qualifies (`mod inner { fn f() }` → `f`; `#[cfg(test)] mod tests { fn works() }` → `works`).
- **R3, bodiless functions.** `function_signature_item` is not reported: it has no body to score.

A function's start line is the line of its first token (`pub`, `async`, `unsafe`, `extern`, `fn`); outer doc comments and attributes are sibling nodes and are excluded.

Control flow (decisions 2026-10-13, R4–R6, R10, R11):

- **R4, wildcard arm.** Only an arm whose pattern is the bare `_` adds no `case`; a guard adds `guard` whatever the pattern. So `_ if c =>` adds exactly one increment, its guard: the pattern always matches, and only the guard decides.
- **R5, `let … else`.** Scores as an `if` (label `if`): it is a conditional branch. An `if` inside its else block is at `L + 1`.
- **R6, `if let` / `while let`.** Count like `if` / `while`; the `let_condition` is the header.
- **R10, blocks and closures.** `unsafe`, `async`, `const` and labelled blocks add nothing and do not nest. `closure_expression` (an `async` closure too) adds nothing and nests its body.
- **R11, guard line.** A guard is recorded on its `if` token, which can sit on a later line than its arm's pattern.

Expressions (decisions 2026-10-13, R7–R9):

- **R7, `let` chains.** `if let Some(x) = a && b` is one `&& sequence` (+1 cognitive, +1 cyclomatic) besides its `if`. `if let Some(x) = a && let Some(y) = b && (c || d)` is `&& && ||`, one `&& || sequence` (cognitive 2, cyclomatic 3). A `while let` chain works the same way. A chain whose operands and `&&` tokens do not alternate is not a sequence: its children are visited as ordinary code.
- **R8, `?` operator.** Off by default. With the rule on, each `?` adds +1 cyclomatic and nothing to cognitive, and does not nest, even inside a closure inside an `if`: SonarSource cognitive complexity does not score early exits.
- **R9, macros.** Opaque, whatever the macro: tree-sitter does not parse macro arguments as expressions, and guessing per macro would be non-deterministic. tree-sitter-rust 0.24.2 yields only tokens, identifiers, literals, metavariables and nested `token_tree`s inside a `token_tree`, so no explicit `token_tree` rule is needed; the `expressions.rs` fixture pins this.

Judgment calls:

| Rule | Default | Effect when `true` |
| --- | --- | --- |
| `count_try_operator` | `false` | Each `?` (`try_expression`) adds a `try operator` increment: +1 cyclomatic, 0 cognitive, no nesting, on the line of its `?` token (a `?` closing a multi-line call is recorded on the `?` line). `a()?.b()?` adds 2. With `false`, `?` adds nothing. |

### Cross-validation

Rust has no reference tool as mature as `gocognit`, so every fixture number is derived from
`metrics.md` by hand. Three tools were compared on Ariadne's own `crates/` (2026-10-13,
built-in defaults, functions matched by name, start and end line):

| Tool | Matched | Cognitive identical (correlation) | Cyclomatic identical (correlation) |
| --- | --- | --- | --- |
| `rust-code-analysis-cli` 0.0.25 | 1,819 / 1,819 | 99% (0.99) | 74% (0.80) |
| `lizard` 1.24.1 `-Ecognitive` | 1,809 / 1,819 | 93% (0.93) | 83% (0.84) |
| Clippy `cognitive_complexity` (threshold 1), all functions it scores above 1 | 1,176 | — (0.09) | — |
| Clippy, the same restricted to functions without macro calls | 242 | 17% (0.59) | — |

- **`?` operator** (cyclomatic; others higher): `rust-code-analysis` and `lizard` count every
  `?` as a branch; Ariadne does not by default (R8, `count_try_operator = false`). Example:
  `crates/ariadne-config/src/resolved.rs` `Config.resolve` (Ariadne 1, `lizard` 10,
  `rust-code-analysis` 11, the extra 1 coming from its closure). Counting the `?`s in each
  function's source, they explain 71% of the points by which `lizard` is higher and 29% of
  those by which `rust-code-analysis` is higher.
- **Closures** (cyclomatic; `rust-code-analysis` higher): it reports each closure as a
  function of its own and also adds it to the enclosing function's sum; Ariadne rolls a
  closure into the enclosing function, adding nothing for the closure itself while its body
  nests one level (R10). This is most of the remaining `rust-code-analysis` gap.
- **Nesting inside `loop`** (cognitive; `rust-code-analysis` lower): of its 13 cognitive
  differences, `crates/ariadne-lang/src/rust.rs` `base_type_name` (a `loop` holding two
  `match`es) is 1 + 2 + 2 = 5 under `metrics.md` and in Ariadne, 2 in `rust-code-analysis`,
  which does not nest the `match`es in the `loop`.
- **Macros** (Clippy higher): over all functions (first Clippy row) Clippy scores the
  expanded code, so `assert!`/`assert_eq!` make tests its highest scorers (its top 12 are
  all tests with a cognitive score of 0–5 in Ariadne); Ariadne treats a macro call as opaque
  (R9). Leaving out functions with macro calls (second row) raises the correlation from
  0.09 to 0.59. What remains is Clippy's own algorithm, which is not SonarSource's, so
  Clippy is not a reference.

### Ariadne on itself

Ariadne's own source is Rust and passes the default limits (cyclomatic 10, cognitive 15) with no `[[exemptions]]`. `crates/ariadne-cli/tests/self_check.rs` runs `ariadne check crates` from the repository root and fails on any violation. The repository's `.ariadne.toml` (R14) excludes `tests/fixtures/**`, which is deliberately complex, restating the built-in exclude entries, and sets `[lint] command` to `cargo clippy --workspace --all-targets -- -D warnings`, CLAUDE.md's rule, so the Stop gate enforces it when dogfooding. Long `match`es were the only violations; they were split by concern or turned into lookup tables, never into meaningless parts.

## TypeScript — `tree-sitter-typescript` 0.23.2

`.ts`, `.mts` and `.cts` files are parsed with the `typescript` grammar, `.tsx` files with
the `tsx` grammar (the extension decides; JSX only parses as `.tsx`, a `<T>value` type
assertion only as `.ts`). Both grammars share every node kind below, so a function
scores the same in either.

Outside the counting rules below, TypeScript differs from Go and Rust in four places:

- **Limits.** The `[thresholds]` defaults (cyclomatic 10), except `length`: 120 in a
  `.tsx` file (`[languages.typescript.tsx]`), 80 elsewhere. See
  [configuration.md](configuration.md#which-limit-applies).
- **Syntax errors** never block: the grammar rejects some valid TypeScript. See
  [how-it-works.md](how-it-works.md#files-with-syntax-errors).
- **Lint and tests** run per package, with default commands worked out from each
  package's scripts (see [Lint and test commands](#lint-and-test-commands) below). They
  never use the top-level `[lint]` and `[tests]`. See
  [configuration.md](configuration.md#typescript).
- **Comments that count as code** for the comment-only skip (`@ts-expect-error`,
  `eslint-disable…`, JSX pragmas, …): see
  [how-it-works.md](how-it-works.md#edits-that-only-change-comments).

Reported functions and their names (decisions 2026-10-15):

| Source | Name |
| --- | --- |
| `function f() {}`, `function* g() {}`, `async function`, `export function` (`function_declaration`, `generator_function_declaration`) | `f`, `g`; anywhere, also inside another function (as Rust) |
| class method, getter, setter, `static`, `#private`, `constructor` (`method_definition` in a `class_body`) | `Class.m`, `Class.#p`, `Class.constructor`; a getter and its setter are both `Class.x`, in line order. A class inside a function still qualifies its methods. |
| class field holding an arrow or function expression `handle = () => {}` (`public_field_definition` `value`), or a call with one (`handle = debounce(() => …)`) | `Class.handle` |
| top-level `const` / `let` / `var` (exported or not) bound to an arrow or function expression | the binding name (`var legacy = function named() {}` is `legacy`) |
| `export default function () {}`, `export default () => {}`, `export default class { m() {} }` | `default`, `default.m`; a named default keeps its name |
| `module.exports = function () {}` | `module.exports` |
| `exports.x = …`, `module.exports.x = …` | `x` |
| any other assignment target `X.y = () => …` | its text, whitespace collapsed: `App.getInitialProps` |
| class expression `const Foo = class { m() {} }` | `Foo.m`; a class expression with its own name uses it (`const A = class B { m() {} }` is `B.m`) |
| object-literal method `{ m() {} }`, or arrow/function as a property value, outside every function | `obj.m` when the object is the value of a binding (a `const`/`let`/`var` name, an assignment, `export default`, a class field), else `m`. Quoted keys lose their quotes (`"kebab-name"` → `obj.kebab-name`). |
| **top-level callback**: an arrow or function expression passed as an argument to a call outside every function | a named function expression keeps its own name (`export default memo(function Page() {…})` → `Page`). Else, when the call's value is bound, directly or through enclosing calls and `await` (`export const Row = memo(forwardRef((p, ref) => …))`), the binding name: `Row`; when it is an object property's value (`create: procedure.input(x).mutation(async () => …)`), the key, qualified as object members are: `create`, or `procedures.create` when the object is bound to `procedures`. Else `<callee>("<first argument>")` when the first argument is a string literal or a template without substitutions (`it('x')` → `it("x")`), else `<callee>`. |

- **Wrappers and values.** Parentheses, `as T`, `satisfies T`, `!` and `<T>` between a
  function and its binding are looked through: `export const handle = (async (e) => …)
  satisfies Handle` is `handle`.
- **Callback names.** The callee is its chain of identifiers and property names joined
  with `.`, whatever the formatting: call arguments, subscripts and whitespace are
  dropped (`main()\n  .then(…)\n  .catch` → `main.then.catch`,
  `protectedProcedure.input(z.object({…})).mutation` → `protectedProcedure.input.mutation`,
  `it.each([…])("doubles %i", …)` → `it.each("doubles %i")`); links that are not names
  (an array literal in `[1, 2].forEach`) add nothing. A name built from source text (a
  callback's call, an assignment target) has control characters dropped and is cut to
  60 characters. A binding that is a pattern (`const { result } = renderHook(() => …)`)
  names nothing, so the call's name is used: `renderHook`. Several function arguments
  of one call (`app.get("/x", auth, (req, res) => …, (err, req, res) => …)`) are each
  reported under the same name, in line order.
- **Transparent wrappers.** A top-level callback is a transparent wrapper, not reported,
  when its call is neither bound nor a property value and its block body has **at least
  one** callback call and nothing else but callback calls, declarations, and `for`,
  `for…of`, `for…in` or `while` loops and plain blocks holding only these
  (`describe("x", () => { const f = make(); beforeEach(…); for (const c of cases) { it(…) } })`).
  A callback call is an expression statement that calls with an arrow or function
  expression among its arguments, or calls a test lifecycle hook (`beforeEach`,
  `afterEach`, `beforeAll`, `afterAll`, by that bare name) with any arguments, so
  `afterEach(cleanup)` keeps a `describe` a wrapper; an awaited call (`await act(() => …)`)
  is not one. Declarations are `const` / `let` / `var`, `type`, `interface` and `enum`
  declarations, and class (also `abstract class`) and named `function` declarations,
  whose methods and bodies are reported on their own; a stray `;` and comments are
  allowed too. Any
  other statement (`if`, `try`, `return`, `throw`, `switch`, a labelled statement, a
  `do … while`, any other expression statement) makes the callback a reported function,
  so a handler (`router.get("/x", async (req, res) => { try { … } catch { … } })`,
  `addEventListener("message", (e) => { if … })`, `toFactory(() => { return … })`) is
  always judged, and so are an empty callback (`it("todo", () => {})`) and a
  `describe` holding only declarations. A wrapper's inner callbacks are judged as
  top-level callbacks, recursively, each starting at nesting 0, also inside its loops
  and blocks; its declarations (`const fixture = …`, `const h = () => …`) and object
  methods in it are not judged. A callback whose only statement is a callback call is a
  wrapper too (`setInterval(() => { items.forEach((i) => { … }) })` reports
  `items.forEach`). A callback whose body is an expression (`() => it(…)`), a bound
  callback (`export const Row = memo((p) => { useEffect(…) })`) and a callback of a
  property-valued call are never wrappers.
- **Decorators.** Functions in a decorator's arguments (`@Type(() => Number)`,
  `@ManyToOne(() => User, (u) => u.photos)`) are not reported, and a decorator with its
  arguments belongs to no function body: nothing in it counts toward the function around
  it, not even a parameter decorator's (`@Inject(forwardRef(() => (a ? A : B)))` adds
  nothing to its constructor).
- **Inside functions.** Every other arrow or function expression inside a function is
  anonymous: it adds 0, nests its body one level deeper and its lines count toward the
  enclosing function's length (as Go closures). Object-literal methods and property
  functions inside a function are anonymous too.
- **Not reported:** overload signatures (`function_signature`, `method_signature`),
  abstract methods (`abstract_method_signature`), interface methods, `declare` forms,
  and a pattern-bound function (`const { a } = () => …`). Known limits (not reported, not
  judged): a top-level IIFE, functions in a top-level array, `new X(() => …)` at top
  level, a top-level `cond ? () => … : () => …`, a top-level function used as an object
  (`export const f = function () { … }.bind(this)`, `.call(…)`, `.apply(…)`), a top-level
  operand of `||`, `&&` or `??` (`var extend = (this && this.extend) || function () { … }`),
  a default value in a top-level destructuring pattern
  (`export let { f = () => 1 } = options`), the declarations directly in a
  transparent wrapper, and every function inside a decorator's arguments, however large
  (NestJS `@Module({ imports: [LoggerModule.forRoot({ customProps: (req) => … })] })`,
  `useFactory: async (config) => …` in `@Module`): such code is never judged.
  Five more kinds of code belong to no reported function and are judged nowhere:
  - a top-level class field whose value is not a function (`level = a ?? b`) and a
    `static { … }` block. They rarely hold logic: in cal.com, 3 of 487 do (cross-validation
    below);
  - a transparent wrapper's own loops and the arguments of its calls that are not functions:
    in `describe("x", () => { for (const r of [false, true]) { it(r ? "a" : "b", () => …) } })`
    the `for` and the conditional in the test title count nowhere; the `it` callback is
    judged as usual.
  - an arrow whose body is a generic tagged template, and everything in it (a grammar gap):
    `` export const asUuid = (id: string) => sql<string>`${id}::uuid` `` parses as the arrow
    called with the template, so `asUuid` is not reported and the template's substitutions
    count nowhere (4 functions in the five cross-validation corpora);
  - an arrow or function in a JSX attribute outside every function, and everything in it,
    as in a top-level `root.render(<App onReady={() => …} />)` or JSX inside a top-level
    object (`description: <Trans bold={(text) => <b>{text}</b>} />`; 3 functions in the
    five corpora).
  - an arrow or function in a tagged template's substitutions outside every function, and
    everything in it, as in styled-components or emotion styles:
    `` export const Box = styled.div`color: ${(p) => (p.active ? "red" : "gray")};` ``.
    Such arrows are usually one-line style picks; inside a function they are anonymous
    and count toward it as usual.
- **Speed.** Each function's role is worked out from the functions around it, without a
  cache, so very large or deeply nested `describe` files take a few seconds (one
  `describe` holding 2,000 `it`s, or `describe`s nested 200 deep, about 3 s); ordinary
  test files are unaffected.
- Namespaces (`namespace`, `module`) do not qualify names (as Rust `mod`).

Start line: at the declaration. A `function` declaration or a bound arrow starts at its
`export` keyword when exported, else at `function` / `const` / `let` / `var` (a later
declarator of `const a = …, b = …` at its own name); a method at its first token
(modifiers included); a class field at its first token after its decorators; an assignment
at its target; an object property at its key; a callback bound through its call at the
binding's line, and one whose call is a property's value at the key; an unbound callback at its own first token. Decorators are never part of
the span: a method's are its siblings in the class body, and a class field's are skipped.
The end line is the function's last token.

| Construct | Node kinds / shape |
| --- | --- |
| Anonymous function | an `arrow_function`, `function_expression`, `generator_function` or object-literal `method_definition` that is not reported (see above): adds 0, nests its body |
| If | `if_statement` (`condition` is header; `consequence` is body) |
| Else-if / else | the `alternative` field of `if_statement`, an `else_clause` whose statement (comments skipped) is an `if_statement` (else-if, recorded on its `if`, even on the line after `else`) or any other statement, a block or not (else, recorded on the `else` keyword) |
| Loop | `for_statement`, `for_in_statement` (`for…in`, `for…of` and `for await…of`), `while_statement`, `do_statement`: the `body` field is the body, every other child the header, including a `do…while` condition written after its body. A loop inside a `labeled_statement` is recorded on the label's line (its first token, as Rust's `'outer: for`); a label on anything else (a block) adds nothing. |
| Switch | `switch_statement`: `value` is the header, the clauses of its `switch_body` the body |
| Case | `switch_case`, one per clause, so fall-through `case 1: case 2:` is 2; `switch_default` is not counted |
| Catch | `catch_clause` (`parameter` is header, `body` is body), with or without a binding; `try` and `finally_clause` add nothing |
| Conditional | `ternary_expression`, recorded on the line of its `?`: `condition` is header, `consequence` and `alternative` are body, so a chained `a ? b : c ? d : e` nests (+1, then +2). A type-level `A extends B ? X : Y` (`conditional_type`) is not counted. |
| Logical operators | `binary_expression` whose `operator` is `&&`, `\|\|` or `??` (`??` only with `count_nullish_coalescing`); `parenthesized_expression` is looked through, so `(a ?? b) \|\| c` is one `?? \|\| sequence`. The grammar binds a non-null `!`, `as` and `satisfies` looser than the binary operators before them: `a && n! >= 0 && b` parses as `((a && n)! >= 0) && b`, `a && b!.c && d` as `((a && b)!.c) && d` (likewise `b!(…)`, `b![…]`, `b! as T`, `b!.c!`, `n!!`) and `a && b as T \|\| d` as `((a && b) as T) \|\| d`. A misparse is a chain of `non_null_expression`, `as_expression`, `satisfies_expression`, `member_expression`, `subscript_expression` and `call_expression` (through their expression, `object` or `function`) that reaches a `binary_expression` with no parentheses between. An expression holding one is read as written: its operators and operands are taken in source order through every `binary_expression` and misparsed chain, never through parentheses, and its counted logical operators form one sequence, as they would in a correct tree (`a && n! >= 0 && b` and `a && b!.c && d` are each one `&& sequence`, cognitive 1, cyclomatic 2). The operands between two logical operators (`n! >= 0`) form one operand, and a chain's own operands (call arguments, a subscript's index) join the operand before them: a logical expression inside them stays a separate sequence (`a && b!(c \|\| e) && d` is an `&& sequence` and an `\|\| sequence`); with `count_optional_chaining`, a `?.` in the chain still adds its `optional chain` (`a && b!?.(1) && d` is cyclomatic 4 in its function). |
| Logical assignment | `augmented_assignment_expression` whose `operator` is `&&=`, `\|\|=` or `??=` (`??=` only with `count_nullish_coalescing`): a sequence of its one operator (`&& sequence`, `\|\| sequence`, `?? sequence`; +1 cognitive, +1 cyclomatic), recorded on the operator's line. It is never part of a sequence around it or inside its value: `o.a \|\|= b && c` and `a && (o.b \|\|= c)` are two sequences each. Other assignments (`+=`, `\|=`, …) add nothing. |
| Optional chaining | only with `count_optional_chaining`: each `optional_chain` (the `?.` of `a?.b`, `a?.[i]`) and each `call_expression` holding a bare `?.` token (`f?.()`, which this grammar version represents without an `optional_chain` node) adds an `optional chain` on the `?.` line, so `o?.m?.()` is 2 |
| Labelled jump | `break_statement` / `continue_statement` with a `label` field; unlabelled ones add nothing |
| Decorators | `decorator` (on a class, method, field or parameter), with its arguments: belongs to no function body, nothing inside it counts |
| Computed method key | the logic in a method's computed key (`[a ? b : c]() {}`) counts toward the method; ESLint and SonarJS count it outside the method (a documented difference, rare: 1 method in the cross-validation corpora) |
| Not counted | `try`, `finally`, `default`, `return`, `throw`, `await`, `yield`, `async`, recursion; a default parameter value itself (`a = 1`; logic inside it, such as `b = a ?? 0`, counts like any expression); type syntax: `as`, `satisfies`, the non-null `!`, `<T>` assertions, generics, type guards (`x is T`), conditional types; JSX elements and attributes themselves. JSX expressions are ordinary expressions: `{a && <X/>}` is an `&& sequence`, `{a ? <X/> : <Y/>}` a conditional, `{xs.map((x) => …)}` an anonymous function. |
| Parameters | the `required_parameter` and `optional_parameter` children of `parameters`, each 1: a destructured pattern (`{ a, b }: Props`), a default (`a = 1`), a rest (`...xs`), an optional (`a?`) and a constructor parameter property (`private readonly x: X`). A `this:` parameter (its `pattern` is `this`) is 0. An unparenthesized `x => …` (the `parameter` field) has 1. Comments and type parameters are not counted, nor the parameters inside a parameter's function type. |
| Test code | every function in a file whose name ends in `.test`, `.spec`, `.e2e-spec`, `.e2e`, `.integration-test` or `.cy` followed by any TypeScript extension (`.ts`, `.tsx`, `.mts`, `.cts`: `cart.test.ts`, `Button.cy.tsx`, `api.spec.cts`), or whose path, relative to the repository root, has a folder named `__tests__`, `__mocks__`, `test`, `tests`, `testing` or `e2e`. Test functions are judged against `[test_code]`. |
| Test companion | a failing lint or test output that names `x.test.<ext>`, `x.spec.<ext>` or `__tests__/x[.test\|.spec].<ext>` (a TypeScript extension) names `x.ts`, `x.tsx`, `x.mts` and `x.cts` beside it (beside `__tests__`), for a subagent sharing a lint or test run with another agent (see `how-it-works.md`, Subagents). |
| Progress lines | a line starting `PASS ` (Jest, a passing suite) or `✓ ` (Vitest) is never read for file names when a shared lint or test failure is attributed (see `how-it-works.md`, Subagents). |

Judgment calls:

| Rule | Default | Effect |
| --- | --- | --- |
| `count_nullish_coalescing` | `true` | `??` is a logical operator and `??=` a one-operator sequence, like `\|\|` and `\|\|=`. With `false`, both add nothing, and `??` ends a logical expression like any other operator: `(a ?? b) \|\| c` is a `\|\| sequence`, and `a ?? (b && c)` still has its `&& sequence`. |
| `count_optional_chaining` | `false` | With `true`, each `?.` adds an `optional chain`: +1 cyclomatic, 0 cognitive, no nesting, on the `?.` line (a `?.` starting a later line of a chain is recorded there). With `false`, `?.` adds nothing. |

Known limits (counting):

- On one line, increments keep the walk order: a construct before what its header and body
  hold. So `a && b ? 1 : 2` records its `conditional` before the `&& sequence` of its
  condition, and `o?.a ?? 0` its `?? sequence` before the `optional chain` inside it.
  A `do…while` written on one line reads `loop`, then its condition, then its body, since
  the condition is the loop's header: `do { if (a) x(); } while (b && c);` records `loop`,
  `&& sequence`, `if`. Scores, `nesting` and `nesting_line` are unaffected.
- A class declared inside a decorator's arguments still has its methods reported, under
  the usual names; nothing else in a decorator is judged (see Decorators above).

### Lint and test commands

With no `[languages.typescript.lint]` or `[languages.typescript.tests]` command, each
package runs default commands. Ariadne never installs anything and never runs `npx`.

**The package.** A changed file runs its commands in its package folder: the nearest
folder above it, up to the repository root, whose `package.json` has a script the default
test command would run (`test:unit`, `test:unit:ci`, `unit`, or a real `test`). When no
`package.json` up to the root has one, it is the nearest folder with a `package.json`.
A script is real when it is a string that is not empty and not npm's placeholder
(`echo "Error: no test specified" && exit 1`). A `package.json` that cannot be read or is
not valid JSON has no scripts.

**Dependencies.** The defaults run only when the package's own dependencies are
installed, found the way Node finds them. Ariadne reads the package names in the
`package.json`'s `dependencies` and `devDependencies`, and every one of them must be
found. A name is found when a `node_modules` folder holds a folder named after it
(`node_modules/vite`, or `node_modules/@types/node` for a scoped name; a link to a folder
counts, as pnpm makes). Ariadne looks in the package folder first, then in each folder
above it, as Node does, so it also looks above the repository root, and each name may be
found at a different level: some in the package's own `node_modules`, some hoisted to the
root of an npm, Yarn or Bun workspace. One missing name is enough for the note:
- a `node_modules` installed at the root only for git hooks (husky);
- one holding only a tool cache (`node_modules/.vite`);
- a stray `~/node_modules` that happens to hold `typescript`;
- an install without dev dependencies (`npm ci --omit=dev`), since the test runner is
  missing.

`optionalDependencies` (such as `fsevents`, installed only on macOS) and
`peerDependencies` may be absent from a working install, so they are not checked. A
package that declares no `dependencies` or `devDependencies` counts any `node_modules`
folder in its folder or above. Ariadne checks the names in sorted order and stops at the
first one it cannot find; it never lists folders. When the dependencies are not found,
both stages are skipped with a note. When a `.pnp.cjs` file is in the
package folder or above it, up to the repository root (Yarn Plug'n'Play), the note says so.

**Subagent worktrees.** A subagent's worktree in `.claude/worktrees/<name>` sits inside the
main checkout, so the main checkout's `node_modules` is above it. When that `node_modules`
holds all the package's dependencies (npm or Yarn hoisting to the root), the defaults run
in the worktree, as Node would resolve them, with `tsc` named by a path that climbs out of
the worktree (`../../../../../node_modules/.bin/tsc` from `apps/web`). pnpm installs into
each package's own `node_modules`, which the worktree does not have: there the note says
the dependencies are not installed, even when the checkout's root `node_modules` holds
some of them (a `typescript` shared by the root and the package). To check such a worktree, install its dependencies in
the worktree, or set the commands in `.ariadne.toml`.

**Tests**, from the package's own `package.json`:

1. The first real script of `test:unit`, `test:unit:ci` and `unit`: `npm run <script>`.
2. Else a real `test` script: `npm test`.
3. Else nothing, with a note.

Scripts for other suites (`test:e2e`, `e2e`, `test:integration`, `integration`, ...) never
run by default.

**Lint** is type checking only:

1. The first real script of `type-check`, `typecheck` and `check-types`: `npm run <script>`.
2. Else the installed `tsc`, when a `tsconfig.json` is in the package folder or above it
   (up to the repository root): `node_modules/.bin/tsc --noEmit --skipLibCheck`. `tsc` is
   the nearest `node_modules/.bin/tsc` in the package folder or above it (above the
   repository root too, as for the dependencies), named by its path from the package folder
   (`../../node_modules/.bin/tsc --noEmit --skipLibCheck` when it is hoisted to the root of
   a monorepo). `tsc` reads the nearest `tsconfig.json`
   itself. `--skipLibCheck` skips declaration files (`.d.ts`), whose errors usually sit in
   installed packages and cannot be fixed in the project; the Vite and Next.js templates
   set it too. Errors in the project's `.ts` and `.tsx` files still block, also those that were
   there before the turn (as with `go vet`); errors in the project's own `.d.ts` files
   are skipped too.
3. Else nothing, with a note.

A `lint` script never runs: it often runs `eslint --fix`, which rewrites files.

**Solution-style `tsconfig.json`.** When the nearest `tsconfig.json` has a non-empty
`references` list, `"files": []`, and no `include` (or an empty one), plain
`tsc --noEmit` would check nothing. The fallback then checks each referenced project, in
order: `node_modules/.bin/tsc --noEmit --skipLibCheck -p tsconfig.app.json &&
node_modules/.bin/tsc --noEmit --skipLibCheck -p tsconfig.node.json` (the Vite
template). A reference to a folder means its
`tsconfig.json`. Paths are relative to the package folder, quoted only when needed.
References that do not exist or lie outside the repository are skipped; with none left,
lint is skipped with a note. `tsc -b` is never used, since build mode writes the
projects' JavaScript and declaration files.
A `tsconfig.json` without a `files` key gets tsc's default `include` (every file below
it), so it is not solution-style and runs plain `tsc`, without `-p`. The file is read as tsc
reads it: comments, trailing commas and a byte order mark are allowed; a file that still
cannot be read runs plain `tsc`.

**Notes.** A skipped stage never blocks and never counts as a failure. It leaves the
package's changed files not covered, and adds one note per stage and package. Notes show
only in a blocking report; on a turn that ends, the status line says `lint not run` /
`tests not run` (every package skipped) or `lint passed, 1 file not covered` (some ran):

| Note | Why |
|---|---|
| `note: tests not run in <dir>: no unit test or test script in package.json; not blocking` | No test script the default runs. |
| `note: lint not run in <dir>: no type-check script, and no installed tsc with a tsconfig.json; not blocking` | No type-check script, and no installed `tsc` or no `tsconfig.json` (also: a solution-style one with no existing reference). |
| `note: <stage> not run in <dir>: dependencies not installed (no node_modules holds them); not blocking` | A dependency or dev dependency of the package is in no `node_modules` in the package folder or above it. |
| `note: <stage> not run in <dir>: Yarn Plug'n'Play (dependencies not in node_modules): default commands cannot run; not blocking` | The same, and a `.pnp.cjs` up to the repository root. |

To fix one, install the dependencies, or set the command yourself (see
[configuration.md](configuration.md#typescript)).

**A set command always wins.** `[languages.typescript.lint]` or
`[languages.typescript.tests]` with a `command` runs that command in each package folder,
whatever its scripts and `node_modules`. `command = ""` turns the stage off, with no
note.

**Failing test.** When a test command fails (default or set), Ariadne names the first
failing test file, as it does a Go test: the first source file (`.ts`, `.tsx`,
`.mts`, `.cts`, `.js`, `.jsx`, `.mjs`, `.cjs`) after `FAIL` on a line of the output, so
Jest's `FAIL src/a.test.ts (5.1 s)` and Vitest's `FAIL  src/a.test.ts > suite > name` both
give `src/a.test.ts`. A project name before the file (Vitest `|web|`, a Jest
`displayName`) is skipped, and color and hyperlink codes are removed first. The output
shown in a blocking report has them removed too, as for every language (Jest colors its
code frames even when `CI=true` is set and the output is piped). A turn that
ends with the tests still failing shows it in its status line:
`tests failed: npm test in apps/web (src/a.test.ts)`.

Known limits:

- A package with only lint scripts (`check-types`, no test script) is not its own package:
  it uses the nearest folder above it that has a test script, often the root, for lint too.
- A package that declares no `dependencies` or `devDependencies` counts any
  `node_modules` folder in its folder or above as installed, even an empty one, so the
  command runs and may fail.
- A dependency folder that is there but half-installed (an interrupted install) counts as
  found.
- The `tsc` fallback writes no JavaScript, but a `tsconfig.json` with
  `"incremental": true` (the Next.js and NestJS templates) makes it write its
  `.tsbuildinfo` file. It writes no other output.
- A `tsconfig.json` whose `references` point at composite projects that are not built yet
  fails with `TS6305` (`Output file ... has not been built from source file`) until they
  are built. Build the referenced projects once (`tsc -b`, which writes their output), or
  set `[languages.typescript.lint]` to your own type-check command. (`tsc -b --noEmit`
  does not help here: it fails with `TS6310`, since a referenced composite project may
  not disable emit.)
- A reference that is itself a solution-style config is checked as written, so tsc checks
  nothing for it.
- A failing test file whose path holds a space is named from its last part
  (`FAIL src/my tests/a.test.ts` gives `tests/a.test.ts`).
- A `test` script that runs end-to-end tests will run: point `test:unit` at the unit tests,
  or set `[languages.typescript.tests]`.
- npm runs a script's `pre` and `post` scripts (`pretest`, `posttest`), so a `pretest`
  that runs `prisma generate` runs on every check.
- A script that itself calls `pnpm`, `yarn` or `turbo` needs that tool installed.
- A dependency added to `package.json` but not installed yet makes the package count as
  not installed: lint and tests show "not run" notes until it is installed.
- The `tsc` fallback takes its options only from `tsconfig.json` and `--skipLibCheck`.
  Type errors already in the project's own code block the turn, as in Go; a project that
  type-checks with other flags inside another script can add a `type-check` script or set
  `[languages.typescript.lint]`.

### Layouts

What runs where, with dependencies installed and no `.ariadne.toml` commands.

**A pnpm and turbo monorepo:**

```
package.json                  "test": "turbo run test", "type-check": "turbo run type-check"
apps/web/package.json         "test:unit": "vitest run", "type-check": "tsc --noEmit"
apps/api/package.json         "test": "jest", "check-types": "tsc --noEmit"
packages/shared/package.json  "test": "jest", "check-types": "tsc --noEmit"
node_modules/                 (one install at the root)
```

A change in `apps/web` runs `npm run type-check` and `npm run test:unit` in `apps/web`; a
change in `apps/api` runs `npm run check-types` and `npm test` in `apps/api`; a change in
both runs each package once. The root's `turbo` scripts never run. A change in
`packages/shared` runs only its own scripts, not those of the apps that use it.

**A Go program with a Vite frontend in `web/`** (the `react-ts` template: no test script,
a solution-style `tsconfig.json`):

```
go.mod, main.go
web/package.json              "dev", "build", "lint", "preview" only
web/tsconfig.json             "files": [], references to tsconfig.app.json and tsconfig.node.json
web/node_modules/
```

A turn that changes `main.go` and `web/src/App.tsx` runs `go vet` and `go test` on `.` at
the root, and in `web/` `node_modules/.bin/tsc --noEmit --skipLibCheck -p
tsconfig.app.json && node_modules/.bin/tsc --noEmit --skipLibCheck -p
tsconfig.node.json`. Tests for `web/` are skipped with a
note until it has a test script (add `"test:unit": "vitest run"`, for example). Go
commands never run in `web/`, and the TypeScript commands never run for Go files.

**`go.mod` and `package.json` at the same root** (a `test` script, a `tsconfig.json` with
`include`): a turn that changes a `.go` and a `.ts` file runs `go vet` and `go test` on
`.`, `node_modules/.bin/tsc --noEmit --skipLibCheck` and `npm test`, all at the root, each
once.

### Cross-validation

Run with `scripts/crossval_ts.py` (Ariadne built-in defaults: `count_nullish_coalescing =
true`, `count_optional_chaining = false`) against ESLint 9.39.5 core `complexity` and
`eslint-plugin-sonarjs` 4.2.2 `cognitive-complexity` (S3776), both at threshold 0 so every
function is scored, parsed by `@typescript-eslint/parser` 8.71.2 (TypeScript 6.0.3, Node
25.8.2):

```bash
npm install --prefix "$SCRATCH" eslint@9.39.5 @typescript-eslint/parser@8.71.2 eslint-plugin-sonarjs@4.2.2
scripts/crossval_ts.py --ariadne target/release/ariadne --corpus path/to/project --eslint-dir "$SCRATCH"
```

The script copies the corpus's `*.ts`, `*.tsx`, `*.mts` and `*.cts` files (no declaration
files; `node_modules`, `dist`, `build`, `coverage`, `.next` and dot directories skipped) into
a temp dir, so nothing is written in the measured project, and runs ESLint with a generated
flat config that ignores inline `eslint-disable` comments. It stops if the two tools did not
see the same files. ESLint 9.39.5's `complexity` has no option for `?.`, default values or
logical assignment: it always counts all three. Its only other option, `variant:
"modified"`, counts a `switch` once instead of each case; the script uses the default
`classic` variant, which counts cases as `metrics.md` does.

Both tools score **every** function on its own, nested arrows included, with nesting
restarting at 0 in each (SonarJS 4.2.2 attributes nested functions to the outer one only in
its file-level total). The generated config adds a rule of its own that records, from
ESLint's tree, each function's position and context and the syntax the comparison needs.
The script then:

- matches each Ariadne function to the tools' function node that ends on Ariadne's end line
  and starts on or after Ariadne's start line, the outermost one if several do. Ariadne's
  start is the declaration (`export`, `const`, a method's modifiers or key; decorators
  excluded); ESLint's function node starts at the `function` keyword, the parameters or
  (for a method) after the key, never earlier. A callback bound through calls (`export const
  Row = memo((p) => …)`) and a top-level callback end on the same line as their arrow. An
  Ariadne function with no match is UNEXPLAINED;
- rolls every other function into the nearest matched function around it, as `metrics.md`
  does: ESLint's scores are summed, minus each nested function's base 1; SonarJS's
  increments are rebased by the level the nested function's body sits at in Ariadne (the
  control-flow nesting around it, counted with SonarJS's own nesting nodes, +1 per function
  boundary). Functions inside a decorator are never rolled in;
- accepts a function no Ariadne function holds only when its shape proves a documented
  known limit: in decorator arguments; a top-level IIFE, array element, `new X(…)` argument
  or conditional branch; in a static block; an arrow whose body is a generic tagged template
  (a `TaggedTemplateExpression` with type arguments); outside every function, the
  expression of a JSX attribute's value (`<X onReady={() => …} />`, nothing else in JSX)
  or a substitution of a tagged template (`` styled.div`${(p) => …}` ``; a plain template
  without a tag does not count; none in the five corpora);
  or a transparent wrapper, checked against the wrapper rule above (a callback of a call
  that is a statement, or starts a chain that is one, as `expect(fn).toThrow()`;
  block-bodied, holding only callback calls, declarations and loops, with reported
  functions inside), and the functions in its declarations, loop headers and non-function
  call arguments, and the shapes above when they sit in a wrapper's body (an IIFE there),
  but never a function that is itself a call argument (a callback, which Ariadne reports);
  outside every function, a function used as the object of a member access
  (`function () {}.call(this)`), an operand of `||`, `&&` or `??`, or a default value in a
  destructuring pattern (array element or object property). Functions inside an
  unreported function inherit its class.
  Any other unreported function, and any `function` declaration or class method left
  unreported, is UNEXPLAINED;
- leaves out files whose functions cannot be matched by line, and says how many: minified
  code (at least half its text on lines over 500 characters, where several functions share
  a line; one long regex or data line in a handwritten file does not count) and files with a
  U+2028 or U+2029 character (ESLint counts it as a line break; Ariadne, like editors,
  does not, so every later line number differs);
- counts a class field initializer of a class declared inside a function (ESLint scores it
  as a function of its own) toward the innermost Ariadne function around it, as Ariadne
  does;
- compares cyclomatic totals, and cognitive increments one by one: structural increments
  (`if`, `else if`, `else`, loops, `switch`, `catch`, conditionals, labelled jumps) by line
  and amount, logical ones by their total, so offsetting differences cannot hide in an equal
  total. The cyclomatic difference must equal exactly the `?.`, default values and
  decorator logic ESLint counts in those functions. The logical totals are checked against
  counts taken from ESLint's tree, not from Ariadne: Ariadne's must equal `metrics.md`'s
  runs of like operators in each logical tree plus one per logical assignment, and
  SonarJS's its runs of `&&` outside JSX short-circuits, so a sequence split or merged by
  mistake is UNEXPLAINED.

| Corpus (commit) | Files (skipped) | Functions: Ariadne / ESLint / SonarJS above 0 | Cyclomatic: Ariadne functions with a difference / tool-only functions | Cognitive: with a difference / tool-only | Unexplained |
| --- | --- | --- | --- | --- | --- |
| A private NestJS + Next.js application | 889 (2) | 5,859 / 10,495 / 1,470 | 734 / 4,658 | 719 / 509 | 0 |
| `colinhacks/zod` (`680d19f`) | 511 (4) | 4,726 / 8,692 / 1,561 | 463 / 4,034 | 540 / 389 | 0 |
| `excalidraw/excalidraw` (`4c37956`) | 666 (5) | 5,829 / 11,313 / 3,180 | 1,424 / 6,113 | 1,266 / 1,156 | 0 |
| `immich-app/immich` (`c43573b`) | 1,072 (12) | 8,716 / 12,944 / 1,949 | 794 / 4,534 | 788 / 391 | 0 |
| `calcom/cal.com` (`54343aa`) | 4,953 (23) | 16,002 / 28,984 / 6,902 | 3,259 / 13,469 | 3,138 / 2,692 | 0 |

ESLint also scores class field initializers and static blocks as implicit functions (22,
68, 629, 306 and 487 in these corpora; counted in "tool-only"). Skipped files are those
Ariadne marks `incomplete` (the grammar rejects some valid TypeScript, see
[how-it-works.md](how-it-works.md#files-with-syntax-errors)); ESLint parsed every file. A
function counts as having a difference when the tool's own score for it differs, or when
causes offset each other (a nested function's `if` against a `?.`); one with several causes
counts once in the table and once per cause below (totals over the five corpora).

Cyclomatic (ESLint `complexity`):

- **Nested functions** (25,586 nested functions ESLint reports on their own; the score of
  3,258 Ariadne functions differs through them, alone or with another cause): Ariadne rolls
  an anonymous function into the enclosing function (`metrics.md`, Function boundaries),
  adding its decision points but no base 1. Example: excalidraw
  `examples/with-script-in-browser/utils.ts:58` `debounce` (Ariadne 2; ESLint 1 for
  `debounce` and 2 for the `ret.flush = () => { if … }` arrow inside it).
- **`?.`** (3,850 functions; ESLint higher): ESLint counts every optional member access and
  call; `count_optional_chaining` is off by default. Example: zod
  `packages/bench/error-construction-breakdown.ts:30` `finalizeLoop` (Ariadne 15, ESLint 29:
  14 `?.`).
- **Default values** (1,481 functions; ESLint higher): ESLint counts each `AssignmentPattern`,
  a default parameter or a destructuring default (`const { a = 1 } = o`); a default value
  adds nothing in Ariadne. Example: cal.com `apps/api/v2/src/lib/safe-parse/safe-parse.ts:6`
  `safeParse` (Ariadne 4, ESLint 5).
- **Not reported by Ariadne** (ESLint-only functions, each proved by its shape to be one of
  the known limits above): transparent wrapper callbacks (4,318, whose inner callbacks are
  reported instead), functions in a wrapper's declarations (446) or in its loop headers and
  non-function call arguments (25), functions in decorator arguments (485, NestJS
  `@Module`/`@Type(() => …)`), top-level IIFEs and the functions inside them (216, such as
  excalidraw's `export const isSomeElementSelected = (function () {…})()`), functions in
  top-level arrays (185), `new X(() => …)` arguments (18) and conditional branches (10),
  arrows with a generic tagged template body (4, immich `server/src/utils/database.ts:85`
  `asUuid`), functions in top-level JSX attributes (3, excalidraw
  `examples/with-script-in-browser/index.tsx:23`), and
  class field initializers / static blocks (1,512, almost all scored 1: a field value that
  is not a function, `level = a ?? b`, and a `static { … }` block belong to no reported
  function, so their logic is judged nowhere; 3 of cal.com's 487 hold any). A wrapper
  callback's own score is its loops and the conditionals in its calls' arguments, which are
  judged nowhere (excalidraw `packages/element/tests/binding.test.tsx:380`, a `describe` with
  two `for` loops and conditional test titles: SonarJS 11).

Cognitive (SonarJS `cognitive-complexity`):

- **Nested functions** (4,963 nested functions SonarJS scores above 0 on their own; 2,761
  Ariadne functions differ through them, alone or with another cause): SonarJS restarts
  nesting at 0 in a nested function; `metrics.md` nests an anonymous function's body one
  level below where it sits. After rebasing, every structural increment agrees by line and
  amount.
- **`||` and `??` runs** (4,897 functions; SonarJS lower; a deliberate choice, ruling
  2026-10-16: `metrics.md` stays the reference): SonarJS 4.2.2 adds +1 only for a run of
  `&&` (`a || b` and `a ?? b` add 0; `a && b || c` adds 1); `metrics.md` adds +1 per run of
  like operators, whatever the operator, and Ariadne's `||=` / `??=` add +1 that SonarJS
  does not count either. Example: zod `packages/zod/src/v3/types.ts:687` `isValidIP`
  (`(version === "v4" || !version) && …` twice: Ariadne 6, SonarJS 4).
- **JSX `&&`** (578 functions; SonarJS lower; a deliberate choice, ruling 2026-10-16: a
  conditional render is a branch, so Ariadne keeps counting it): SonarJS skips a `&&`-only
  expression directly in a JSX container (`{open && <Panel/>}`); in Ariadne JSX expressions
  are ordinary expressions. Example: cal.com
  `apps/web/app/(use-page-wrapper)/availability/[schedule]/skeleton.tsx:7`
  `AvailabilityScheduleSkeleton` (Ariadne 1, SonarJS 0).
- **SonarJS nesting leak** (15 functions; SonarJS higher): when a conditional's branch is
  itself a function (`fn: typeof f === "function" ? f : (v) => f.test(v)`), SonarJS raises
  the enclosing function's nesting on entering that branch but lowers the inner function's
  on leaving it, so every later structural increment of the enclosing function scores one
  level deeper (a SonarJS defect; parentheses do not avoid it). Example: zod
  `packages/zod/src/v4/core/api.ts:1855` `_stringFormat` (Ariadne 2, SonarJS 3).
- **`&&=`** (none in these corpora): Ariadne counts it as an `&& sequence`; SonarJS does not
  count logical assignment.
- The ESLint-only functions above, where SonarJS scores them above 0.

No other differences: `if`, `else if` (+1, flat), `else`, every loop, `switch` (+1 + L once;
cases +1 cyclomatic each, `default` excluded), `catch`, conditionals (recorded on the `?`;
the condition at the conditional's level and only its branches nested, so a chained
`a ? b : c ? d : e` is +1 then +2), labelled jumps, `&&`/`||`/`??` sequences through
parentheses and ending at unary `!`, calls and comparisons (checked against ESLint's tree),
and the nesting of anonymous functions agree increment by increment once the classes above
are accounted for.

Mapping bug found and fixed (2026-10-16): tree-sitter-typescript 0.23.2 binds a postfix `!`,
`as` and `satisfies` looser than the binary operators before them (`a && n! >= 0 && b`
parses as `((a && n)! >= 0) && b`), which split one logical expression into several
sequences; see Logical operators above. Old and new binaries agree on every function's
scores in the five corpora except two: excalidraw `packages/element/src/delta.ts:1111`
`ElementsDelta.satisfiesCommmonInvariants` (cognitive 3 → 1) and the private application's
`ProcessCard` (47 → 46). Three more keep their scores but regroup their increments into one
sequence through parentheses, as `metrics.md` reads them: excalidraw
`excalidraw-app/collab/Portal.tsx:142` `Portal.broadcastScene` (`(… || v > get(id)!) && …`)
and two functions of the private application (`peek()!.value === "+" || …` inside
parentheses).

## JavaScript — `tree-sitter-javascript` 0.25.0

`.js`, `.jsx`, `.mjs` and `.cjs` files are parsed with the `javascript` grammar, which
accepts JSX in every one of them. JavaScript shares TypeScript's mapping (decision
2026-10-17): every rule in the TypeScript section above applies to it, with the same
names, spans, wrappers, known limits and counting. The same function scores the same in
a `.js` and a `.ts` file. Only these differ:

- **Grammar.** A class field is a `field_definition` (its name in the `property` field),
  not a `public_field_definition`. A parameter is a bare name or pattern (`a`, `a = 1`,
  `...rest`, `{ a }`, `[a]`), each 1; there is no `this:` parameter. Every `?.` is an
  `optional_chain` node, also in `f?.()`. A method's decorators sit inside the method,
  and its span still starts after them.
- **Limits.** The `[thresholds]` defaults, except `length`: 120 in a `.jsx` file
  (`[languages.javascript.jsx]`), 80 elsewhere. JSX written in a plain `.js` file keeps 80;
  raise it with `[[overrides]]` paths if your project writes components in `.js` files.
- **Rules.** `[languages.javascript.rules]` has the same two rules with the same defaults,
  set apart from TypeScript's.
- **Syntax errors** never block, as in TypeScript. Flow type annotations
  (`function f(a: number)` in a `// @flow` file) are not JavaScript: such a file gets a
  note, and the functions that parsed are still judged.
- **Comments that count as code.** TypeScript's list, plus `JSDoc` blocks (`/** … */`)
  that carry types: a line starting with `@type`, `@typedef`, `@template`, `@satisfies`,
  `@import`, `@callback`, `@enum`, `@extends`, `@augments`, `@implements`, `@overload` or
  `@constructor`, or with `@param`, `@arg`, `@argument`, `@returns`, `@return`,
  `@property`, `@prop` or `@this` followed by a `{type}` (`@param {string} name`). `tsc`
  reads them in JavaScript (`checkJs`), so changing one is a code change. Untyped
  `@param name` lines and access tags (`@private`, `@public`, `@readonly`, `@override`)
  stay plain: in most JavaScript they only document (known limit: `checkJs` also reads the
  access tags). In a TypeScript file every `JSDoc` stays plain.
- **Test code and test companions.** TypeScript's markers and folders with the
  JavaScript extensions: `cart.test.js`, `Button.cy.jsx`, `api.spec.mjs`. A test file of
  either language pairs with sources of both: `form.test.js` names `form.ts` and `form.js`.

### Lint and test commands

As TypeScript's (the package, the dependency check, the notes, tests), except lint:

**Lint** is only a type-check script: the first real script of `type-check`, `typecheck`
and `check-types` (`npm run <script>`), else nothing, with the note
`no type-check script in package.json`. There is no `tsc` fallback: without `checkJs`,
`tsc` checks no JavaScript. A `lint` script never runs.

JavaScript never uses the top-level `[lint]` and `[tests]`; its own sections are
`[languages.javascript.lint]` and `[languages.javascript.tests]`.

**A package with TypeScript and JavaScript files** (a `.ts` app with a
`jest.config.js`) runs each command once per stage: when its TypeScript and JavaScript
files need the same command in the same folder, it runs once and covers both. A stage
turned off for one language runs nothing for that language's files.

### Cross-validation

Run with the same script and versions as TypeScript, with `--language javascript`: it
copies the `*.js`, `*.jsx`, `*.mjs` and `*.cjs` files (minified `*.min.js` left out, as
Ariadne's defaults exclude them) and ESLint reads them with the same parser, which accepts
JSX in every JavaScript file.

```bash
scripts/crossval_ts.py --ariadne target/release/ariadne --corpus path/to/project --eslint-dir "$SCRATCH" --language javascript
```

Results (2026-10-17, release build of branch `feat/javascript`): **0 unexplained** on

| Corpus | Commit | Files compared | Ariadne functions | Left out (minified, U+2028) |
| --- | --- | --- | --- | --- |
| expressjs/express (CommonJS) | `a419aa7` | 141 | 1,540 | 0 |
| mastodon/mastodon `app/javascript` (React `.jsx`) | `7f90e0f` | 173 | 1,295 | 0 |
| webpack/webpack (modern JavaScript, JSDoc types) | `36f36bc4` | 16,201 | 25,607 | 77 |

Every difference falls in a class shared with TypeScript (functions the tools score on their
own and Ariadne rolls in, wrappers, `||` runs, default values, `?.`, the top-level known
limits above). Making the script cover JavaScript surfaced shapes the TypeScript corpora did
not have; they belong to the shared mapping and are documented in the TypeScript section:
a function used as an object (`function () {}.bind(this)`), a `||` operand
(`(this && this.x) || function () {}`) and a destructuring default outside every function,
an IIFE inside a wrapper, a wrapper whose call starts a chain (`expect(fn).toThrow()`), class
field initializers of a class inside a function, and logic in a computed method key
(1 method). After those changes the script still finds 0 unexplained on TypeScript
(colinhacks/zod 4,726 functions, all 511 files; excalidraw 5,826, 4 files left out), and
a build that stopped reporting
JavaScript class fields gave 331 unexplained differences on Mastodon, so the new classes do not hide
real gaps.

Length of JSX: in Mastodon, 3.4% of the `.jsx` functions (652) are longer than 80 lines and
1.5% longer than 120; for its `.js` functions (628), 1.1% and 0.3%. This supports the
`.jsx` length of 120.

## Java

Mapped and verified in a later milestone; see the spec's language table until then.
