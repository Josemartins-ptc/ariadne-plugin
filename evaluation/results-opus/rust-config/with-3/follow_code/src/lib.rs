//! rustconfig: parses a small INI-like configuration format with
//! environment-variable overrides and required-key checks.

use std::collections::BTreeMap;
use std::time::Duration;

/// A parsed configuration value.
#[derive(Debug, Clone, PartialEq)]
pub enum Value {
    Int(i64),
    Bool(bool),
    Str(String),
    List(Vec<Value>),
    Duration(Duration),
}

/// A parsed configuration.
#[derive(Debug, Clone, PartialEq)]
pub struct Config {
    /// Section name (empty for the root section) -> key -> value.
    sections: BTreeMap<String, BTreeMap<String, Value>>,
}

impl Config {
    /// Looks up a value by its dotted name (`"section.key"`, or `"key"` for root keys).
    pub fn get(&self, dotted: &str) -> Option<&Value> {
        let (section, key) = split_dotted(dotted);
        self.sections.get(section)?.get(key)
    }
}

/// Everything that can go wrong while parsing a configuration.
#[derive(Debug, Clone, PartialEq)]
pub enum ConfigError {
    Syntax { line: usize },
    BadValue { line: usize },
    BadEscape { line: usize },
    DuplicateKey { line: usize, key: String },
    MissingRequired(String),
    BadEnv(String),
}

/// Parses `text`, applies the overrides in `env`, then checks that every name in `required` exists.
pub fn parse(
    text: &str,
    env: &BTreeMap<String, String>,
    required: &[&str],
) -> Result<Config, ConfigError> {
    parse_with_defaults(text, env, required, &[])
}

/// Like [`parse`], but before the overrides adds each of `defaults` whose name does not exist yet.
///
/// Precedence is environment over text over defaults; keys from defaults count as present.
pub fn parse_with_defaults(
    text: &str,
    env: &BTreeMap<String, String>,
    required: &[&str],
    defaults: &[(&str, Value)],
) -> Result<Config, ConfigError> {
    let mut config = parse_text(text)?;
    apply_defaults(&mut config, defaults);
    apply_env(&mut config, env)?;
    for name in required {
        if config.get(name).is_none() {
            return Err(ConfigError::MissingRequired(name.to_string()));
        }
    }
    Ok(config)
}

/// Splits a dotted name into `(section, key)`; names without a `.` are root keys.
fn split_dotted(dotted: &str) -> (&str, &str) {
    dotted.rsplit_once('.').unwrap_or(("", dotted))
}

/// Why a value text failed to parse; the caller turns it into a `ConfigError`.
enum ValueError {
    Bad,
    Escape,
}

/// Adds each default whose name does not exist yet; earlier defaults win over later ones.
fn apply_defaults(config: &mut Config, defaults: &[(&str, Value)]) {
    for (dotted, value) in defaults {
        let (section, key) = split_dotted(dotted);
        config
            .sections
            .entry(section.to_string())
            .or_default()
            .entry(key.to_string())
            .or_insert_with(|| value.clone());
    }
}

fn parse_text(text: &str) -> Result<Config, ConfigError> {
    let mut sections: BTreeMap<String, BTreeMap<String, Value>> = BTreeMap::new();
    let mut current = String::new();
    for (index, raw) in text.split('\n').enumerate() {
        let line = index + 1;
        let trimmed = raw.trim();
        if trimmed.is_empty() || trimmed.starts_with(';') || trimmed.starts_with('#') {
            continue;
        }
        if trimmed.starts_with('[') {
            current = parse_header(trimmed).ok_or(ConfigError::Syntax { line })?;
            continue;
        }
        let (key, value_text) = parse_assignment(trimmed).ok_or(ConfigError::Syntax { line })?;
        let value = parse_value(value_text).map_err(|e| match e {
            ValueError::Bad => ConfigError::BadValue { line },
            ValueError::Escape => ConfigError::BadEscape { line },
        })?;
        let section = sections.entry(current.clone()).or_default();
        if section.contains_key(key) {
            return Err(ConfigError::DuplicateKey { line, key: key.to_string() });
        }
        section.insert(key.to_string(), value);
    }
    Ok(Config { sections })
}

/// Returns the section name of a header line, or `None` if it is malformed.
fn parse_header(line: &str) -> Option<String> {
    let name = line.strip_prefix('[')?.strip_suffix(']')?;
    let valid = !name.is_empty()
        && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '.');
    valid.then(|| name.to_string())
}

/// Splits an assignment line into its key and trimmed value text.
fn parse_assignment(line: &str) -> Option<(&str, &str)> {
    let (key, value) = line.split_once('=')?;
    let key = key.trim();
    let valid = !key.is_empty() && key.chars().all(|c| c.is_ascii_alphanumeric() || c == '_');
    valid.then(|| (key, value.trim()))
}

fn parse_value(text: &str) -> Result<Value, ValueError> {
    if text.starts_with('[') {
        return parse_list(text);
    }
    parse_scalar(text)
}

/// Parses an integer, boolean, string or duration value text.
fn parse_scalar(text: &str) -> Result<Value, ValueError> {
    match text {
        "true" => return Ok(Value::Bool(true)),
        "false" => return Ok(Value::Bool(false)),
        _ => {}
    }
    if text.starts_with('"') {
        return parse_string(text).map(Value::Str);
    }
    if let Some(duration) = parse_duration(text) {
        return duration.map(Value::Duration);
    }
    let digits = text.strip_prefix(['+', '-']).unwrap_or(text);
    if digits.is_empty() || !digits.bytes().all(|b| b.is_ascii_digit()) {
        return Err(ValueError::Bad);
    }
    text.parse::<i64>().map(Value::Int).map_err(|_| ValueError::Bad)
}

/// Parses a duration value text: ASCII digits followed by `ms`, `s`, `m` or `h`.
///
/// Returns `None` if `text` does not have that shape, and an error if it overflows.
fn parse_duration(text: &str) -> Option<Result<Duration, ValueError>> {
    // `ms` comes first so that `250ms` is not read as `250m` followed by `s`.
    let (digits, secs_per_unit) = [("ms", 0), ("s", 1), ("m", 60), ("h", 3600)]
        .into_iter()
        .find_map(|(unit, secs)| text.strip_suffix(unit).map(|digits| (digits, secs)))?;
    if digits.is_empty() || !digits.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    let duration = digits.parse::<u64>().ok().and_then(|n| match secs_per_unit {
        0 => Some(Duration::from_millis(n)),
        secs => n.checked_mul(secs).map(Duration::from_secs),
    });
    Some(duration.ok_or(ValueError::Bad))
}

/// Parses a quoted string value text (starting with `"`).
fn parse_string(text: &str) -> Result<String, ValueError> {
    let body = &text[1..];
    let mut out = String::new();
    let mut chars = body.char_indices();
    while let Some((i, c)) = chars.next() {
        match c {
            // The closing quote must be the last character of the value text.
            '"' if i + 1 == body.len() => return Ok(out),
            '"' => return Err(ValueError::Bad),
            // A backslash at the very end leaves the string unterminated.
            '\\' => out.push(unescape(chars.next().ok_or(ValueError::Bad)?.1)?),
            _ => out.push(c),
        }
    }
    Err(ValueError::Bad)
}

/// Returns the character that `\` followed by `c` stands for.
fn unescape(c: char) -> Result<char, ValueError> {
    match c {
        '"' => Ok('"'),
        '\\' => Ok('\\'),
        'n' => Ok('\n'),
        't' => Ok('\t'),
        _ => Err(ValueError::Escape),
    }
}

/// Parses a list value text (starting with `[`).
fn parse_list(text: &str) -> Result<Value, ValueError> {
    let inner = text
        .strip_prefix('[')
        .and_then(|t| t.strip_suffix(']'))
        .ok_or(ValueError::Bad)?
        .trim();
    if inner.is_empty() {
        return Ok(Value::List(Vec::new()));
    }
    let mut items = Vec::new();
    for item in split_list_items(inner) {
        let item = item.trim();
        if item.is_empty() || item.starts_with('[') {
            return Err(ValueError::Bad);
        }
        items.push(parse_scalar(item)?);
    }
    Ok(Value::List(items))
}

/// Splits list contents at commas that are not inside a string item.
fn split_list_items(inner: &str) -> Vec<&str> {
    let mut items = Vec::new();
    let mut start = 0;
    let mut in_string = false;
    let mut escaped = false;
    for (i, c) in inner.char_indices() {
        if in_string {
            if escaped {
                escaped = false;
            } else if c == '\\' {
                escaped = true;
            } else if c == '"' {
                in_string = false;
            }
        } else if c == '"' {
            in_string = true;
        } else if c == ',' {
            items.push(&inner[start..i]);
            start = i + 1;
        }
    }
    items.push(&inner[start..]);
    items
}

/// The environment variable name that overrides `key` in `section`.
fn env_name(section: &str, key: &str) -> String {
    let mut name = String::from("APP_");
    if !section.is_empty() {
        name.push_str(&section.replace('.', "_").to_ascii_uppercase());
        name.push('_');
    }
    name.push_str(&key.to_ascii_uppercase());
    name
}

fn apply_env(config: &mut Config, env: &BTreeMap<String, String>) -> Result<(), ConfigError> {
    for (name, raw) in env {
        let mut targets: Vec<&mut Value> = config
            .sections
            .iter_mut()
            .flat_map(|(section, keys)| {
                keys.iter_mut()
                    .filter(move |(key, _)| env_name(section, key) == *name)
                    .map(|(_, value)| value)
            })
            .collect();
        if targets.is_empty() {
            continue;
        }
        let value = parse_value(raw.trim()).map_err(|_| ConfigError::BadEnv(name.clone()))?;
        for slot in targets.iter_mut() {
            **slot = value.clone();
        }
    }
    Ok(())
}
