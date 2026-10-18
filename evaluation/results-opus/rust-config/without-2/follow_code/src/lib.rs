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
    /// Section name (empty for root) -> key -> value.
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

/// Like [`parse`], but after reading `text` each of `defaults` (a dotted name and a value)
/// is added if that name does not exist yet; the overrides in `env` apply afterwards.
///
/// Precedence is environment over text over defaults.
pub fn parse_with_defaults(
    text: &str,
    env: &BTreeMap<String, String>,
    required: &[&str],
    defaults: &[(&str, Value)],
) -> Result<Config, ConfigError> {
    let mut sections: BTreeMap<String, BTreeMap<String, Value>> = BTreeMap::new();
    sections.insert(String::new(), BTreeMap::new());
    let mut current = String::new();

    for (idx, raw) in text.split('\n').enumerate() {
        let line = idx + 1;
        let trimmed = raw.trim();
        if trimmed.is_empty() || trimmed.starts_with(';') || trimmed.starts_with('#') {
            continue;
        }
        if let Some(rest) = trimmed.strip_prefix('[') {
            let name = rest
                .strip_suffix(']')
                .filter(|n| !n.is_empty() && n.chars().all(is_section_char))
                .ok_or(ConfigError::Syntax { line })?;
            current = name.to_string();
            sections.entry(current.clone()).or_default();
            continue;
        }
        let (key, value_text) = trimmed
            .split_once('=')
            .ok_or(ConfigError::Syntax { line })?;
        let key = key.trim();
        if key.is_empty() || !key.chars().all(is_key_char) {
            return Err(ConfigError::Syntax { line });
        }
        let value = parse_value(value_text.trim()).map_err(|e| e.at(line))?;
        let section = sections.get_mut(&current).expect("current section exists");
        if section.contains_key(key) {
            return Err(ConfigError::DuplicateKey {
                line,
                key: key.to_string(),
            });
        }
        section.insert(key.to_string(), value);
    }

    for (dotted, value) in defaults {
        let (section, key) = split_dotted(dotted);
        sections
            .entry(section.to_string())
            .or_default()
            .entry(key.to_string())
            .or_insert_with(|| value.clone());
    }

    for (name, raw_value) in env {
        let mut parsed: Option<Value> = None;
        for (section_name, section) in sections.iter_mut() {
            for (key, value) in section.iter_mut() {
                if env_name(section_name, key) != *name {
                    continue;
                }
                if parsed.is_none() {
                    parsed = Some(
                        parse_value(raw_value.trim())
                            .map_err(|_| ConfigError::BadEnv(name.clone()))?,
                    );
                }
                *value = parsed.clone().expect("parsed above");
            }
        }
    }

    let config = Config { sections };
    for name in required {
        if config.get(name).is_none() {
            return Err(ConfigError::MissingRequired(name.to_string()));
        }
    }
    Ok(config)
}

/// A value error not yet tied to a line.
enum ValueError {
    Bad,
    Escape,
}

impl ValueError {
    fn at(self, line: usize) -> ConfigError {
        match self {
            ValueError::Bad => ConfigError::BadValue { line },
            ValueError::Escape => ConfigError::BadEscape { line },
        }
    }
}

fn is_key_char(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_'
}

fn is_section_char(c: char) -> bool {
    is_key_char(c) || c == '.'
}

/// Splits a dotted name at its last `.` into (section, key).
fn split_dotted(dotted: &str) -> (&str, &str) {
    dotted.rsplit_once('.').unwrap_or(("", dotted))
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

/// Parses a trimmed value text, including lists.
fn parse_value(text: &str) -> Result<Value, ValueError> {
    if let Some(rest) = text.strip_prefix('[') {
        let inner = rest.strip_suffix(']').ok_or(ValueError::Bad)?.trim();
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
        return Ok(Value::List(items));
    }
    parse_scalar(text)
}

/// Splits list contents at commas that are not inside a string.
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

/// Parses an integer, boolean, string or duration value text.
fn parse_scalar(text: &str) -> Result<Value, ValueError> {
    match text {
        "true" => return Ok(Value::Bool(true)),
        "false" => return Ok(Value::Bool(false)),
        _ => {}
    }
    if let Some(rest) = text.strip_prefix('"') {
        return parse_string(rest).map(Value::Str);
    }
    let digits = text.strip_prefix(['+', '-']).unwrap_or(text);
    if !digits.is_empty() && digits.bytes().all(|b| b.is_ascii_digit()) {
        return text
            .parse::<i64>()
            .map(Value::Int)
            .map_err(|_| ValueError::Bad);
    }
    parse_duration(text).map(Value::Duration)
}

/// Parses a duration: ASCII digits immediately followed by `ms`, `s`, `m` or `h`.
fn parse_duration(text: &str) -> Result<Duration, ValueError> {
    let (digits, millis, secs_per_unit) = if let Some(d) = text.strip_suffix("ms") {
        (d, true, 0)
    } else if let Some(d) = text.strip_suffix('s') {
        (d, false, 1)
    } else if let Some(d) = text.strip_suffix('m') {
        (d, false, 60)
    } else if let Some(d) = text.strip_suffix('h') {
        (d, false, 3600)
    } else {
        return Err(ValueError::Bad);
    };
    if digits.is_empty() || !digits.bytes().all(|b| b.is_ascii_digit()) {
        return Err(ValueError::Bad);
    }
    let n: u64 = digits.parse().map_err(|_| ValueError::Bad)?;
    if millis {
        return Ok(Duration::from_millis(n));
    }
    n.checked_mul(secs_per_unit)
        .map(Duration::from_secs)
        .ok_or(ValueError::Bad)
}

/// Parses the body of a string after its opening quote.
fn parse_string(rest: &str) -> Result<String, ValueError> {
    let mut out = String::new();
    let mut chars = rest.chars();
    while let Some(c) = chars.next() {
        match c {
            '"' => {
                return if chars.as_str().is_empty() {
                    Ok(out)
                } else {
                    Err(ValueError::Bad)
                };
            }
            '\\' => match chars.next() {
                Some('"') => out.push('"'),
                Some('\\') => out.push('\\'),
                Some('n') => out.push('\n'),
                Some('t') => out.push('\t'),
                Some(_) => return Err(ValueError::Escape),
                None => return Err(ValueError::Bad),
            },
            _ => out.push(c),
        }
    }
    Err(ValueError::Bad)
}
