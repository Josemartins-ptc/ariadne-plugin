We need two additions to the config parser. Everything that already works must keep working, and `parse` keeps its signature and behaviour except for the new duration values below.

## 1. Duration values

Add a variant `Value::Duration(std::time::Duration)`. A duration value is one or more ASCII digits immediately followed by a unit, with no spaces and no sign: `ms` (milliseconds), `s` (seconds), `m` (minutes), `h` (hours). Examples: `250ms`, `30s`, `5m`, `1h`, `0s`. Units are lower case only. The number must fit in `u64` and the total number of seconds (for `s`, `m`, `h`) must also fit in `u64`; otherwise it is a `BadValue`. Anything else that looks almost like a duration (`5 s`, `-5s`, `+5s`, `1.5h`, `5S`, `5d`, `s`) stays a `BadValue`. Durations are scalar values, so they can appear as list items (`[1s, 250ms]`) and as environment override values, with the same rules.

## 2. Defaults

Add

```rust
pub fn parse_with_defaults(
    text: &str,
    env: &std::collections::BTreeMap<String, String>,
    required: &[&str],
    defaults: &[(&str, Value)],
) -> Result<Config, ConfigError>;
```

Each default is a dotted name (same rule as `Config::get`: the part after the last `.` is the key, the part before it the section, no `.` means a root key) and a value. The order of operations is:

1. read the text (all text errors as before);
2. apply the defaults in order: a default is added only if that name does not exist yet; a name that already exists (from the text or from an earlier default) is left unchanged. A default may create a section that the text does not have. Default values are used as given (not validated);
3. apply the environment overrides as before; they now also apply to keys that came from defaults;
4. check `required` as before; a key that came from a default counts as present.

So the precedence is: environment over text over defaults. `parse(text, env, required)` must behave exactly like `parse_with_defaults(text, env, required, &[])`.
