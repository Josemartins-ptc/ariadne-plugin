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
    for (i, raw) in text.split('\n').enumerate() {
        let line = i + 1;
        let t = raw.trim();
        if t.is_empty() || t.starts_with(';') || t.starts_with('#') {
            continue;
        }
        if let Some(rest) = t.strip_prefix('[') {
            let name = rest.strip_suffix(']').ok_or(ConfigError::Syntax { line })?;
            if name.is_empty()
                || !name
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '.')
            {
                return Err(ConfigError::Syntax { line });
            }
            current = name.to_string();
            sections.entry(current.clone()).or_default();
            continue;
        }
        let (k, v) = t.split_once('=').ok_or(ConfigError::Syntax { line })?;
        let key = k.trim();
        if key.is_empty() || !key.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
            return Err(ConfigError::Syntax { line });
        }
        let value = parse_value(v.trim()).map_err(|e| match e {
            VErr::Value => ConfigError::BadValue { line },
            VErr::Escape => ConfigError::BadEscape { line },
        })?;
        let sec = sections.entry(current.clone()).or_default();
        if sec.contains_key(key) {
            return Err(ConfigError::DuplicateKey {
                line,
                key: key.to_string(),
            });
        }
        sec.insert(key.to_string(), value);
    }

    for (name, val) in env {
        let mut parsed: Option<Value> = None;
        for (sname, keys) in sections.iter_mut() {
            for (k, slot) in keys.iter_mut() {
                if env_name(sname, k) != *name {
                    continue;
                }
                if parsed.is_none() {
                    parsed = Some(
                        parse_value(val.trim()).map_err(|_| ConfigError::BadEnv(name.clone()))?,
                    );
                }
                *slot = parsed.clone().unwrap();
            }
        }
    }

    let config = Config { sections };
    for r in required {
        if config.get(r).is_none() {
            return Err(ConfigError::MissingRequired(r.to_string()));
        }
    }
    Ok(config)
}

fn split_dotted(dotted: &str) -> (&str, &str) {
    match dotted.rsplit_once('.') {
        Some((s, k)) => (s, k),
        None => ("", dotted),
    }
}

fn env_name(section: &str, key: &str) -> String {
    let mut n = String::from("APP_");
    if !section.is_empty() {
        n.push_str(&section.replace('.', "_").to_ascii_uppercase());
        n.push('_');
    }
    n.push_str(&key.to_ascii_uppercase());
    n
}

enum VErr {
    Value,
    Escape,
}

fn parse_scalar(s: &str) -> Result<Value, VErr> {
    if s == "true" {
        return Ok(Value::Bool(true));
    }
    if s == "false" {
        return Ok(Value::Bool(false));
    }
    if s.starts_with('"') {
        return parse_string(s).map(Value::Str);
    }
    let digits = s.strip_prefix(['+', '-']).unwrap_or(s);
    if !digits.is_empty() && digits.bytes().all(|b| b.is_ascii_digit()) {
        return s.parse::<i64>().map(Value::Int).map_err(|_| VErr::Value);
    }
    Err(VErr::Value)
}

fn parse_string(s: &str) -> Result<String, VErr> {
    let mut out = String::new();
    let mut chars = s[1..].chars();
    while let Some(c) = chars.next() {
        match c {
            '"' => {
                return if chars.next().is_none() {
                    Ok(out)
                } else {
                    Err(VErr::Value)
                };
            }
            '\\' => match chars.next() {
                Some('"') => out.push('"'),
                Some('\\') => out.push('\\'),
                Some('n') => out.push('\n'),
                Some('t') => out.push('\t'),
                Some(_) => return Err(VErr::Escape),
                None => return Err(VErr::Value),
            },
            c => out.push(c),
        }
    }
    Err(VErr::Value)
}

fn parse_value(s: &str) -> Result<Value, VErr> {
    if !s.starts_with('[') {
        return parse_scalar(s);
    }
    if s.len() < 2 || !s.ends_with(']') {
        return Err(VErr::Value);
    }
    let inner = s[1..s.len() - 1].trim();
    if inner.is_empty() {
        return Ok(Value::List(Vec::new()));
    }
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
    let mut list = Vec::new();
    for item in items {
        let item = item.trim();
        if item.is_empty() || item.starts_with('[') {
            return Err(VErr::Value);
        }
        list.push(parse_scalar(item)?);
    }
    Ok(Value::List(list))
}
