Implement the configuration parser in this Rust library crate (`rustconfig`, `src/lib.rs`). The public types and the `parse` signature already exist in `src/lib.rs`; keep them exactly as they are (you may add private fields to `Config` and any private helpers). Use only the standard library.

```rust
pub fn parse(
    text: &str,
    env: &std::collections::BTreeMap<String, String>,
    required: &[&str],
) -> Result<Config, ConfigError>;

pub enum Value { Int(i64), Bool(bool), Str(String), List(Vec<Value>) }

impl Config {
    pub fn get(&self, dotted: &str) -> Option<&Value>;
}

pub enum ConfigError {
    Syntax { line: usize },
    BadValue { line: usize },
    BadEscape { line: usize },
    DuplicateKey { line: usize, key: String },
    MissingRequired(String),
    BadEnv(String),
}
```

## File format

The text is read line by line (split on `\n`; a trailing `\r` counts as whitespace). Line numbers are 1-based and count every line, including blank and comment lines. "Whitespace" means what Rust's `str::trim` removes. Leading and trailing whitespace of every line is ignored. After trimming, each line is exactly one of:

1. **Blank or comment**: empty, or starting with `;` or `#`. Ignored. There are no inline comments: `port = 5 # x` has the value text `5 # x`.
2. **Section header**: starts with `[`. It must end with `]`, and the name between the brackets must be non-empty and consist only of ASCII letters, ASCII digits, `_` and `.` (no spaces, no trimming inside the brackets). Otherwise: `Syntax { line }`. Keys that follow belong to this section until the next header. Keys before the first header belong to the root section, whose name is the empty string. A section header may appear more than once; all its occurrences form one section.
3. **Assignment** `key = value`: split at the first `=`. The key is the text before it, trimmed; it must be non-empty and consist only of ASCII letters, ASCII digits and `_`. The value text is the text after the `=`, trimmed. A line with no `=`, or with an invalid key: `Syntax { line }`.

Keys and section names are case-sensitive.

## Values

The value text is one of:

- **Integer**: an optional `+` or `-` followed by one or more ASCII digits (leading zeros allowed), fitting in `i64` → `Value::Int`. Out of range → `BadValue`.
- **Boolean**: exactly `true` or `false` (lower case) → `Value::Bool`.
- **String**: starts with `"`. Characters are read up to the closing unescaped `"`, which must be the last character of the value text. Escapes: `\"` → `"`, `\\` → `\`, `\n` → newline, `\t` → tab. A backslash followed by any other character → `BadEscape { line }`. No closing quote, or anything after the closing quote → `BadValue { line }`. Read left to right; the first problem found decides the error. → `Value::Str`.
- **List**: starts with `[` and must end with `]` (else `BadValue`). The text between the brackets, trimmed, is either empty (an empty list) or items separated by commas. Commas inside a string item do not separate items (strings in lists follow the string rules, including escapes). Each item is trimmed and must be an integer, boolean or string; an empty item (e.g. `[1,,2]` or `[1,]`) or a nested list → `BadValue`. Items may have different types. → `Value::List`.
- Anything else (including an empty value text) → `BadValue { line }`.

## Errors while reading the text

Lines are processed top to bottom and the first error is returned. For an assignment line the checks run in this order: line syntax (`Syntax`), then the value (`BadValue` / `BadEscape`), then duplicates: a key that already exists in the same section (including from an earlier occurrence of the same section header) → `DuplicateKey { line, key }` with the line of the repeated key and the key as written.

## Environment overrides

After the whole text is read without error, apply `env`. Every key in the configuration has an environment name:

- root key `k`: `APP_` + `k` in upper case (e.g. `name` → `APP_NAME`);
- key `k` in section `s`: `APP_` + `s` with every `.` replaced by `_`, in upper case, + `_` + `k` in upper case (e.g. section `server.http`, key `port` → `APP_SERVER_HTTP_PORT`).

Upper-casing is ASCII. Env entry names are compared exactly (case-sensitive). Process `env` in its iteration order (ascending name). For an entry whose name equals the environment name of one or more existing keys, its value is trimmed and parsed with the value rules above, and the result replaces the value of every such key. If it does not parse (bad value or bad escape) → `ConfigError::BadEnv(entry name)`. Entries that match no existing key are ignored (their values are not parsed) and never add keys.

## Required names

After the overrides, check `required` in order. Each name is dotted: the part after the last `.` is the key and the part before it is the section; a name without a `.` is a root key. The first name that does not exist → `ConfigError::MissingRequired(name)` with the name exactly as given.

## Lookup

`Config::get(dotted)` uses the same dotted-name rule and returns the value, or `None` if that section or key does not exist.

The tests in `tests/visible.rs` show the expected usage; run them with `cargo test --quiet`.
