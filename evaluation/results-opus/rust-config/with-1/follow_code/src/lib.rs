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
    /// Section name (`""` for the root) -> key -> value.
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

/// Like [`parse`], but first adds each of `defaults` (dotted name, value) whose name the text
/// does not define. Precedence is environment over text over defaults.
pub fn parse_with_defaults(
    text: &str,
    env: &BTreeMap<String, String>,
    required: &[&str],
    defaults: &[(&str, Value)],
) -> Result<Config, ConfigError> {
    let mut config = Config {
        sections: parse_text(text)?,
    };
    for (name, value) in defaults {
        let (section, key) = split_dotted(name);
        config
            .sections
            .entry(section.to_string())
            .or_default()
            .entry(key.to_string())
            .or_insert_with(|| value.clone());
    }
    apply_env(&mut config, env)?;
    for name in required {
        if config.get(name).is_none() {
            return Err(ConfigError::MissingRequired(name.to_string()));
        }
    }
    Ok(config)
}

/// Splits a dotted name at its last `.` into (section, key); no `.` means a root key.
fn split_dotted(dotted: &str) -> (&str, &str) {
    dotted.rsplit_once('.').unwrap_or(("", dotted))
}

/// A value-level problem, mapped to a `ConfigError` by the caller.
enum ValueError {
    Bad,
    Escape,
}

impl ValueError {
    fn at_line(self, line: usize) -> ConfigError {
        match self {
            ValueError::Bad => ConfigError::BadValue { line },
            ValueError::Escape => ConfigError::BadEscape { line },
        }
    }
}

type Sections = BTreeMap<String, BTreeMap<String, Value>>;

fn parse_text(text: &str) -> Result<Sections, ConfigError> {
    let mut sections = Sections::new();
    sections.insert(String::new(), BTreeMap::new());
    let mut current = String::new();
    for (index, raw) in text.split('\n').enumerate() {
        let line = index + 1;
        let trimmed = raw.trim();
        if trimmed.is_empty() || trimmed.starts_with(';') || trimmed.starts_with('#') {
            continue;
        }
        if trimmed.starts_with('[') {
            current = parse_header(trimmed).ok_or(ConfigError::Syntax { line })?;
            sections.entry(current.clone()).or_default();
            continue;
        }
        let (key, value_text) = parse_assignment(trimmed).ok_or(ConfigError::Syntax { line })?;
        let value = parse_value(value_text).map_err(|e| e.at_line(line))?;
        let keys = sections.get_mut(&current).expect("current section exists");
        if keys.contains_key(key) {
            return Err(ConfigError::DuplicateKey {
                line,
                key: key.to_string(),
            });
        }
        keys.insert(key.to_string(), value);
    }
    Ok(sections)
}

/// Returns the section name of a `[name]` header line, or `None` if it is malformed.
fn parse_header(line: &str) -> Option<String> {
    let name = line.strip_prefix('[')?.strip_suffix(']')?;
    let valid = !name.is_empty()
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '.');
    valid.then(|| name.to_string())
}

/// Splits a `key = value` line into its trimmed key and value text, or `None` if it is malformed.
fn parse_assignment(line: &str) -> Option<(&str, &str)> {
    let (key, value) = line.split_once('=')?;
    let key = key.trim();
    let valid = !key.is_empty() && key.chars().all(|c| c.is_ascii_alphanumeric() || c == '_');
    valid.then(|| (key, value.trim()))
}

fn parse_value(text: &str) -> Result<Value, ValueError> {
    if text.starts_with('[') {
        parse_list(text)
    } else {
        parse_scalar(text)
    }
}

/// Parses an integer, boolean, duration or string value.
fn parse_scalar(text: &str) -> Result<Value, ValueError> {
    if text.starts_with('"') {
        return parse_string(text).map(Value::Str);
    }
    match text {
        "true" => return Ok(Value::Bool(true)),
        "false" => return Ok(Value::Bool(false)),
        _ => {}
    }
    if let Some(duration) = parse_duration(text)? {
        return Ok(Value::Duration(duration));
    }
    let digits = text.strip_prefix(['+', '-']).unwrap_or(text);
    if digits.is_empty() || !digits.bytes().all(|b| b.is_ascii_digit()) {
        return Err(ValueError::Bad);
    }
    text.parse::<i64>().map(Value::Int).map_err(|_| ValueError::Bad)
}

/// Parses `<digits><unit>` with unit `ms`, `s`, `m` or `h`. Returns `Ok(None)` if `text` does not
/// end in a unit, and `Err` if it does but is not a valid duration.
fn parse_duration(text: &str) -> Result<Option<Duration>, ValueError> {
    let (digits, seconds_per_unit) = if let Some(d) = text.strip_suffix("ms") {
        (d, None)
    } else if let Some(d) = text.strip_suffix('s') {
        (d, Some(1))
    } else if let Some(d) = text.strip_suffix('m') {
        (d, Some(60))
    } else if let Some(d) = text.strip_suffix('h') {
        (d, Some(3600))
    } else {
        return Ok(None);
    };
    if digits.is_empty() || !digits.bytes().all(|b| b.is_ascii_digit()) {
        return Err(ValueError::Bad);
    }
    let n: u64 = digits.parse().map_err(|_| ValueError::Bad)?;
    let duration = match seconds_per_unit {
        None => Duration::from_millis(n),
        Some(factor) => Duration::from_secs(n.checked_mul(factor).ok_or(ValueError::Bad)?),
    };
    Ok(Some(duration))
}

/// Parses a quoted string whose closing quote must be the last character of `text`.
fn parse_string(text: &str) -> Result<String, ValueError> {
    let mut chars = text.chars().skip(1);
    let mut out = String::new();
    while let Some(c) = chars.next() {
        match c {
            '"' => {
                return match chars.next() {
                    None => Ok(out),
                    Some(_) => Err(ValueError::Bad),
                };
            }
            '\\' => out.push(parse_escape(chars.next())?),
            _ => out.push(c),
        }
    }
    Err(ValueError::Bad)
}

fn parse_escape(next: Option<char>) -> Result<char, ValueError> {
    match next {
        Some('"') => Ok('"'),
        Some('\\') => Ok('\\'),
        Some('n') => Ok('\n'),
        Some('t') => Ok('\t'),
        Some(_) => Err(ValueError::Escape),
        // A trailing backslash leaves the string unterminated.
        None => Err(ValueError::Bad),
    }
}

fn parse_list(text: &str) -> Result<Value, ValueError> {
    let inner = text
        .strip_prefix('[')
        .and_then(|rest| rest.strip_suffix(']'))
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

/// Splits list contents at commas that are not inside a quoted string.
fn split_list_items(inner: &str) -> Vec<&str> {
    let mut items = Vec::new();
    let mut start = 0;
    let mut in_string = false;
    let mut escaped = false;
    for (i, c) in inner.char_indices() {
        if escaped {
            escaped = false;
        } else if in_string {
            match c {
                '\\' => escaped = true,
                '"' => in_string = false,
                _ => {}
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

/// The environment-variable name that overrides `key` in `section`.
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
    let mut targets: BTreeMap<String, Vec<(String, String)>> = BTreeMap::new();
    for (section, keys) in &config.sections {
        for key in keys.keys() {
            targets
                .entry(env_name(section, key))
                .or_default()
                .push((section.clone(), key.clone()));
        }
    }
    for (name, raw) in env {
        let Some(matches) = targets.get(name) else {
            continue;
        };
        let value = parse_value(raw.trim()).map_err(|_| ConfigError::BadEnv(name.clone()))?;
        for (section, key) in matches {
            let keys = config.sections.get_mut(section).expect("section exists");
            keys.insert(key.clone(), value.clone());
        }
    }
    Ok(())
}
