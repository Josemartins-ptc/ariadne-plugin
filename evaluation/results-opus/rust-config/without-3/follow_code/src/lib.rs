//! rustconfig: parses a small INI-like configuration format with
//! environment-variable overrides and required-key checks.

use std::collections::BTreeMap;

/// A parsed configuration value.
#[derive(Debug, Clone, PartialEq)]
pub enum Value {
    Int(i64),
    Bool(bool),
    Str(String),
    List(Vec<Value>),
    Duration(std::time::Duration),
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

/// Like [`parse`], but after reading `text` adds each of `defaults` (a dotted name and a value)
/// whose name does not exist yet, before the overrides in `env` are applied.
pub fn parse_with_defaults(
    text: &str,
    env: &BTreeMap<String, String>,
    required: &[&str],
    defaults: &[(&str, Value)],
) -> Result<Config, ConfigError> {
    let mut sections: BTreeMap<String, BTreeMap<String, Value>> = BTreeMap::new();
    let mut current = String::new();

    for (index, raw) in text.split('\n').enumerate() {
        let line = index + 1;
        let trimmed = raw.trim();
        if trimmed.is_empty() || trimmed.starts_with(';') || trimmed.starts_with('#') {
            continue;
        }
        if trimmed.starts_with('[') {
            let name = trimmed
                .strip_prefix('[')
                .and_then(|rest| rest.strip_suffix(']'))
                .ok_or(ConfigError::Syntax { line })?;
            if name.is_empty()
                || !name
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '.')
            {
                return Err(ConfigError::Syntax { line });
            }
            current = name.to_string();
            continue;
        }
        let (key, value_text) = trimmed
            .split_once('=')
            .ok_or(ConfigError::Syntax { line })?;
        let key = key.trim();
        if key.is_empty() || !key.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
            return Err(ConfigError::Syntax { line });
        }
        let value = parse_value(value_text.trim()).map_err(|e| match e {
            ValueError::Bad => ConfigError::BadValue { line },
            ValueError::Escape => ConfigError::BadEscape { line },
        })?;
        let section = sections.entry(current.clone()).or_default();
        if section.contains_key(key) {
            return Err(ConfigError::DuplicateKey {
                line,
                key: key.to_string(),
            });
        }
        section.insert(key.to_string(), value);
    }

    for (name, value) in defaults {
        let (section, key) = split_dotted(name);
        sections
            .entry(section.to_string())
            .or_default()
            .entry(key.to_string())
            .or_insert_with(|| value.clone());
    }

    for (name, raw_value) in env {
        let mut parsed: Option<Value> = None;
        for (section_name, keys) in sections.iter_mut() {
            for (key, value) in keys.iter_mut() {
                if env_name(section_name, key) != *name {
                    continue;
                }
                if parsed.is_none() {
                    let v = parse_value(raw_value.trim())
                        .map_err(|_| ConfigError::BadEnv(name.clone()))?;
                    parsed = Some(v);
                }
                *value = parsed.clone().unwrap();
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

/// Splits a dotted name into (section, key) at the last `.`.
fn split_dotted(dotted: &str) -> (&str, &str) {
    dotted.rsplit_once('.').unwrap_or(("", dotted))
}

/// The environment variable name that overrides `key` in `section`.
fn env_name(section: &str, key: &str) -> String {
    if section.is_empty() {
        format!("APP_{}", key.to_ascii_uppercase())
    } else {
        format!(
            "APP_{}_{}",
            section.replace('.', "_").to_ascii_uppercase(),
            key.to_ascii_uppercase()
        )
    }
}

enum ValueError {
    Bad,
    Escape,
}

/// Parses a trimmed value text.
fn parse_value(text: &str) -> Result<Value, ValueError> {
    if !text.starts_with('[') {
        return parse_scalar(text);
    }
    let inner = text
        .strip_prefix('[')
        .and_then(|rest| rest.strip_suffix(']'))
        .ok_or(ValueError::Bad)?
        .trim();
    if inner.is_empty() {
        return Ok(Value::List(Vec::new()));
    }
    split_list_items(inner)
        .into_iter()
        .map(|item| {
            let item = item.trim();
            if item.is_empty() || item.starts_with('[') {
                Err(ValueError::Bad)
            } else {
                parse_scalar(item)
            }
        })
        .collect::<Result<Vec<_>, _>>()
        .map(Value::List)
}

/// Splits list contents on commas that are not inside a string.
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
    if let Some(body) = text.strip_prefix('"') {
        return parse_string(body).map(Value::Str);
    }
    let digits = text.strip_prefix(['+', '-']).unwrap_or(text);
    if !digits.is_empty() && digits.bytes().all(|b| b.is_ascii_digit()) {
        return text.parse::<i64>().map(Value::Int).map_err(|_| ValueError::Bad);
    }
    parse_duration(text).map(Value::Duration).ok_or(ValueError::Bad)
}

/// Parses a duration value text: ASCII digits immediately followed by `ms`, `s`, `m` or `h`.
fn parse_duration(text: &str) -> Option<std::time::Duration> {
    use std::time::Duration;
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

/// Parses the rest of a string value after its opening quote.
fn parse_string(body: &str) -> Result<String, ValueError> {
    let mut out = String::new();
    let mut chars = body.char_indices();
    while let Some((i, c)) = chars.next() {
        match c {
            '"' => {
                return if i + 1 == body.len() {
                    Ok(out)
                } else {
                    Err(ValueError::Bad)
                };
            }
            '\\' => match chars.next() {
                Some((_, '"')) => out.push('"'),
                Some((_, '\\')) => out.push('\\'),
                Some((_, 'n')) => out.push('\n'),
                Some((_, 't')) => out.push('\t'),
                Some(_) => return Err(ValueError::Escape),
                None => return Err(ValueError::Bad),
            },
            _ => out.push(c),
        }
    }
    Err(ValueError::Bad)
}
