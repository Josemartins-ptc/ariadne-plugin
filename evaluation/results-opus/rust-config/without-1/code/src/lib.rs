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
                .filter(|name| is_valid_name(name, true))
                .ok_or(ConfigError::Syntax { line })?;
            current = name.to_string();
            continue;
        }
        let (key, value_text) = trimmed
            .split_once('=')
            .ok_or(ConfigError::Syntax { line })?;
        let key = key.trim();
        if !is_valid_name(key, false) {
            return Err(ConfigError::Syntax { line });
        }
        let value = parse_value(value_text.trim()).map_err(|kind| kind.at(line))?;
        let section = sections.entry(current.clone()).or_default();
        if section.contains_key(key) {
            return Err(ConfigError::DuplicateKey {
                line,
                key: key.to_string(),
            });
        }
        section.insert(key.to_string(), value);
    }

    for (name, raw_value) in env {
        let mut parsed: Option<Value> = None;
        for (section_name, section) in sections.iter_mut() {
            for (key, value) in section.iter_mut() {
                if env_name(section_name, key) != *name {
                    continue;
                }
                if parsed.is_none() {
                    let new_value = parse_value(raw_value.trim())
                        .map_err(|_| ConfigError::BadEnv(name.clone()))?;
                    parsed = Some(new_value);
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

/// Splits a dotted name at its last `.` into (section, key); no `.` means the root section.
fn split_dotted(dotted: &str) -> (&str, &str) {
    dotted.rsplit_once('.').unwrap_or(("", dotted))
}

/// Checks a key (letters, digits, `_`) or, with `allow_dot`, a section name (also `.`).
fn is_valid_name(name: &str, allow_dot: bool) -> bool {
    !name.is_empty()
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || (allow_dot && c == '.'))
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

/// A value error that does not yet know its line number.
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

/// Parses a trimmed value text, including lists.
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
    split_items(inner)
        .into_iter()
        .map(|item| {
            let item = item.trim();
            if item.starts_with('[') {
                Err(ValueError::Bad)
            } else {
                parse_scalar(item)
            }
        })
        .collect::<Result<Vec<_>, _>>()
        .map(Value::List)
}

/// Splits list contents at commas that are not inside a string item.
fn split_items(inner: &str) -> Vec<&str> {
    let mut items = Vec::new();
    let mut start = 0;
    let mut in_string = false;
    let mut chars = inner.char_indices();
    while let Some((i, c)) = chars.next() {
        match c {
            '\\' if in_string => {
                chars.next();
            }
            '"' => in_string = !in_string,
            ',' if !in_string => {
                items.push(&inner[start..i]);
                start = i + 1;
            }
            _ => {}
        }
    }
    items.push(&inner[start..]);
    items
}

/// Parses an integer, boolean or string value text.
fn parse_scalar(text: &str) -> Result<Value, ValueError> {
    match text {
        "true" => return Ok(Value::Bool(true)),
        "false" => return Ok(Value::Bool(false)),
        _ => {}
    }
    if let Some(rest) = text.strip_prefix('"') {
        return parse_string(rest);
    }
    let digits = text.strip_prefix(['+', '-']).unwrap_or(text);
    if digits.is_empty() || !digits.bytes().all(|b| b.is_ascii_digit()) {
        return Err(ValueError::Bad);
    }
    text.parse::<i64>()
        .map(Value::Int)
        .map_err(|_| ValueError::Bad)
}

/// Parses the rest of a string value after its opening quote.
fn parse_string(rest: &str) -> Result<Value, ValueError> {
    let mut out = String::new();
    let mut chars = rest.char_indices();
    while let Some((i, c)) = chars.next() {
        match c {
            '"' => {
                return if i + 1 == rest.len() {
                    Ok(Value::Str(out))
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
