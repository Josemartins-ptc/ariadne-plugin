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

/// Like [`parse`], but after reading `text` adds each of `defaults` whose dotted name does not
/// exist yet, before applying `env`. Precedence: environment over text over defaults.
pub fn parse_with_defaults(
    text: &str,
    env: &BTreeMap<String, String>,
    required: &[&str],
    defaults: &[(&str, Value)],
) -> Result<Config, ConfigError> {
    let mut config = Config { sections: BTreeMap::new() };
    read_text(&mut config, text)?;
    for (dotted, value) in defaults {
        let (section, key) = split_dotted(dotted);
        config
            .sections
            .entry(section.to_string())
            .or_default()
            .entry(key.to_string())
            .or_insert_with(|| value.clone());
    }
    apply_env(&mut config, env)?;
    if let Some(name) = required.iter().find(|name| config.get(name).is_none()) {
        return Err(ConfigError::MissingRequired(name.to_string()));
    }
    Ok(config)
}

/// Splits a dotted name at its last `.` into (section, key); no `.` means the root section.
fn split_dotted(dotted: &str) -> (&str, &str) {
    match dotted.rfind('.') {
        Some(i) => (&dotted[..i], &dotted[i + 1..]),
        None => ("", dotted),
    }
}

/// A value-level error, given a line number (or env name) by the caller.
enum ValueError {
    Bad,
    Escape,
}

fn read_text(config: &mut Config, text: &str) -> Result<(), ConfigError> {
    let mut section = String::new();
    for (index, raw) in text.split('\n').enumerate() {
        let line = index + 1;
        let trimmed = raw.trim();
        if trimmed.is_empty() || trimmed.starts_with(';') || trimmed.starts_with('#') {
            continue;
        }
        if trimmed.starts_with('[') {
            section = parse_header(trimmed).ok_or(ConfigError::Syntax { line })?;
            continue;
        }
        let (key, value_text) = parse_assignment(trimmed).ok_or(ConfigError::Syntax { line })?;
        let value = parse_value(value_text).map_err(|e| match e {
            ValueError::Bad => ConfigError::BadValue { line },
            ValueError::Escape => ConfigError::BadEscape { line },
        })?;
        let keys = config.sections.entry(section.clone()).or_default();
        if keys.contains_key(key) {
            return Err(ConfigError::DuplicateKey { line, key: key.to_string() });
        }
        keys.insert(key.to_string(), value);
    }
    Ok(())
}

fn parse_header(line: &str) -> Option<String> {
    let name = line.strip_prefix('[')?.strip_suffix(']')?;
    let valid = !name.is_empty()
        && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '.');
    valid.then(|| name.to_string())
}

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

fn parse_scalar(text: &str) -> Result<Value, ValueError> {
    match text {
        "true" => return Ok(Value::Bool(true)),
        "false" => return Ok(Value::Bool(false)),
        _ => {}
    }
    if text.starts_with('"') {
        return parse_string(text);
    }
    if let Some(duration) = parse_duration(text) {
        return Ok(Value::Duration(duration));
    }
    let digits = text.strip_prefix(['+', '-']).unwrap_or(text);
    if digits.is_empty() || !digits.bytes().all(|b| b.is_ascii_digit()) {
        return Err(ValueError::Bad);
    }
    text.parse::<i64>().map(Value::Int).map_err(|_| ValueError::Bad)
}

/// Parses `<digits><unit>` with unit `ms`, `s`, `m` or `h`; `None` if `text` is not such a value
/// or the number of milliseconds or seconds does not fit in `u64`.
fn parse_duration(text: &str) -> Option<Duration> {
    let split = text.find(|c: char| !c.is_ascii_digit())?;
    let (digits, unit) = text.split_at(split);
    if digits.is_empty() {
        return None;
    }
    let n: u64 = digits.parse().ok()?;
    match unit {
        "ms" => Some(Duration::from_millis(n)),
        "s" => Some(Duration::from_secs(n)),
        "m" => n.checked_mul(60).map(Duration::from_secs),
        "h" => n.checked_mul(3600).map(Duration::from_secs),
        _ => None,
    }
}

fn parse_string(text: &str) -> Result<Value, ValueError> {
    let mut out = String::new();
    let mut chars = text.char_indices().skip(1);
    while let Some((i, c)) = chars.next() {
        match c {
            // The closing quote must be the last character of the value text.
            '"' if i + 1 == text.len() => return Ok(Value::Str(out)),
            '"' => return Err(ValueError::Bad),
            '\\' => out.push(unescape(chars.next().map(|(_, e)| e))?),
            _ => out.push(c),
        }
    }
    Err(ValueError::Bad)
}

/// Maps the character after a backslash to the character it stands for.
fn unescape(escaped: Option<char>) -> Result<char, ValueError> {
    match escaped {
        Some('"') => Ok('"'),
        Some('\\') => Ok('\\'),
        Some('n') => Ok('\n'),
        Some('t') => Ok('\t'),
        Some(_) => Err(ValueError::Escape),
        None => Err(ValueError::Bad),
    }
}

fn parse_list(text: &str) -> Result<Value, ValueError> {
    if text.len() < 2 || !text.ends_with(']') {
        return Err(ValueError::Bad);
    }
    let inner = text[1..text.len() - 1].trim();
    if inner.is_empty() {
        return Ok(Value::List(Vec::new()));
    }
    let mut items = Vec::new();
    for item in split_items(inner) {
        let item = item.trim();
        if item.is_empty() || item.starts_with('[') {
            return Err(ValueError::Bad);
        }
        items.push(parse_scalar(item)?);
    }
    Ok(Value::List(items))
}

/// Splits list contents at commas that are not inside a string.
fn split_items(inner: &str) -> Vec<&str> {
    let mut items = Vec::new();
    let mut start = 0;
    let mut in_string = false;
    let mut escaped = false;
    for (i, c) in inner.char_indices() {
        if escaped {
            escaped = false;
        } else if in_string && c == '\\' {
            escaped = true;
        } else if c == '"' {
            in_string = !in_string;
        } else if !in_string && c == ',' {
            items.push(&inner[start..i]);
            start = i + 1;
        }
    }
    items.push(&inner[start..]);
    items
}

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
        let targets: Vec<&mut Value> = config
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
        for target in targets {
            *target = value.clone();
        }
    }
    Ok(())
}
