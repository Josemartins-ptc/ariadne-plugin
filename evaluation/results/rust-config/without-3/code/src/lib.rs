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

fn split_dotted(dotted: &str) -> (&str, &str) {
    match dotted.rsplit_once('.') {
        Some((section, key)) => (section, key),
        None => ("", dotted),
    }
}

enum ValueError {
    Bad,
    Escape,
}

fn parse_int(s: &str) -> Result<Value, ValueError> {
    let digits = s.strip_prefix(['+', '-']).unwrap_or(s);
    if digits.is_empty() || !digits.bytes().all(|b| b.is_ascii_digit()) {
        return Err(ValueError::Bad);
    }
    s.parse::<i64>().map(Value::Int).map_err(|_| ValueError::Bad)
}

fn parse_string(s: &str) -> Result<Value, ValueError> {
    let mut out = String::new();
    let mut chars = s.strip_prefix('"').ok_or(ValueError::Bad)?.chars();
    while let Some(c) = chars.next() {
        match c {
            '"' => {
                return if chars.next().is_none() {
                    Ok(Value::Str(out))
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
            c => out.push(c),
        }
    }
    Err(ValueError::Bad)
}

fn parse_scalar(s: &str) -> Result<Value, ValueError> {
    match s {
        "true" => Ok(Value::Bool(true)),
        "false" => Ok(Value::Bool(false)),
        _ if s.starts_with('"') => parse_string(s),
        _ => parse_int(s),
    }
}

fn split_items(inner: &str) -> Vec<&str> {
    let mut items = Vec::new();
    let mut start = 0;
    let mut in_str = false;
    let mut escaped = false;
    for (i, c) in inner.char_indices() {
        if in_str {
            if escaped {
                escaped = false;
            } else if c == '\\' {
                escaped = true;
            } else if c == '"' {
                in_str = false;
            }
        } else if c == '"' {
            in_str = true;
        } else if c == ',' {
            items.push(&inner[start..i]);
            start = i + 1;
        }
    }
    items.push(&inner[start..]);
    items
}

fn parse_value(s: &str) -> Result<Value, ValueError> {
    if s.starts_with('[') {
        if s.len() < 2 || !s.ends_with(']') {
            return Err(ValueError::Bad);
        }
        let inner = s[1..s.len() - 1].trim();
        if inner.is_empty() {
            return Ok(Value::List(Vec::new()));
        }
        let mut list = Vec::new();
        for item in split_items(inner) {
            let item = item.trim();
            if item.is_empty() || item.starts_with('[') {
                return Err(ValueError::Bad);
            }
            list.push(parse_scalar(item)?);
        }
        Ok(Value::List(list))
    } else {
        parse_scalar(s)
    }
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

/// Parses `text`, applies the overrides in `env`, then checks that every name in `required` exists.
pub fn parse(
    text: &str,
    env: &BTreeMap<String, String>,
    required: &[&str],
) -> Result<Config, ConfigError> {
    let mut sections: BTreeMap<String, BTreeMap<String, Value>> = BTreeMap::new();
    let mut current = String::new();
    for (idx, raw) in text.split('\n').enumerate() {
        let line = idx + 1;
        let t = raw.trim();
        if t.is_empty() || t.starts_with(';') || t.starts_with('#') {
            continue;
        }
        if t.starts_with('[') {
            let name = if t.len() >= 2 { t.strip_suffix(']').map(|n| &n[1..]) } else { None };
            match name {
                Some(n)
                    if !n.is_empty()
                        && n.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'.') =>
                {
                    current = n.to_string();
                }
                _ => return Err(ConfigError::Syntax { line }),
            }
            continue;
        }
        let Some((k, v)) = t.split_once('=') else {
            return Err(ConfigError::Syntax { line });
        };
        let key = k.trim();
        if key.is_empty() || !key.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_') {
            return Err(ConfigError::Syntax { line });
        }
        let value = parse_value(v.trim()).map_err(|e| match e {
            ValueError::Bad => ConfigError::BadValue { line },
            ValueError::Escape => ConfigError::BadEscape { line },
        })?;
        let section = sections.entry(current.clone()).or_default();
        if section.contains_key(key) {
            return Err(ConfigError::DuplicateKey { line, key: key.to_string() });
        }
        section.insert(key.to_string(), value);
    }

    for (name, val) in env {
        let mut targets = Vec::new();
        for (s, keys) in &sections {
            for k in keys.keys() {
                if env_name(s, k) == *name {
                    targets.push((s.clone(), k.clone()));
                }
            }
        }
        if targets.is_empty() {
            continue;
        }
        let value = parse_value(val.trim()).map_err(|_| ConfigError::BadEnv(name.clone()))?;
        for (s, k) in targets {
            sections.get_mut(&s).unwrap().insert(k, value.clone());
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
