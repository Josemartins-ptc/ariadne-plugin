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
    match dotted.rfind('.') {
        Some(i) => (&dotted[..i], &dotted[i + 1..]),
        None => ("", dotted),
    }
}

#[derive(Clone, Copy)]
enum ValErr {
    Bad,
    Escape,
}

fn parse_int(text: &str) -> Result<i64, ValErr> {
    let digits = text.strip_prefix(['+', '-']).unwrap_or(text);
    if digits.is_empty() || !digits.bytes().all(|b| b.is_ascii_digit()) {
        return Err(ValErr::Bad);
    }
    text.strip_prefix('+')
        .unwrap_or(text)
        .parse::<i64>()
        .map_err(|_| ValErr::Bad)
}

fn parse_string(text: &str) -> Result<String, ValErr> {
    let mut out = String::new();
    let mut chars = text.chars().skip(1);
    while let Some(c) = chars.next() {
        match c {
            '"' => {
                return if chars.next().is_none() {
                    Ok(out)
                } else {
                    Err(ValErr::Bad)
                };
            }
            '\\' => match chars.next() {
                Some('"') => out.push('"'),
                Some('\\') => out.push('\\'),
                Some('n') => out.push('\n'),
                Some('t') => out.push('\t'),
                Some(_) => return Err(ValErr::Escape),
                None => return Err(ValErr::Bad),
            },
            c => out.push(c),
        }
    }
    Err(ValErr::Bad)
}

fn parse_scalar(text: &str) -> Result<Value, ValErr> {
    if text.starts_with('"') {
        return parse_string(text).map(Value::Str);
    }
    match text {
        "true" => Ok(Value::Bool(true)),
        "false" => Ok(Value::Bool(false)),
        _ => parse_int(text).map(Value::Int),
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

fn parse_value(text: &str) -> Result<Value, ValErr> {
    if text.starts_with('[') {
        if text.len() < 2 || !text.ends_with(']') {
            return Err(ValErr::Bad);
        }
        let inner = text[1..text.len() - 1].trim();
        if inner.is_empty() {
            return Ok(Value::List(Vec::new()));
        }
        let mut list = Vec::new();
        for item in split_items(inner) {
            list.push(parse_scalar(item.trim())?);
        }
        return Ok(Value::List(list));
    }
    parse_scalar(text)
}

fn valid_chars(s: &str, allow_dot: bool) -> bool {
    s.chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_' || (allow_dot && c == '.'))
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
        let line_no = idx + 1;
        let line = raw.trim();
        if line.is_empty() || line.starts_with(';') || line.starts_with('#') {
            continue;
        }
        if line.starts_with('[') {
            if line.len() < 2 || !line.ends_with(']') {
                return Err(ConfigError::Syntax { line: line_no });
            }
            let name = &line[1..line.len() - 1];
            if name.is_empty() || !valid_chars(name, true) {
                return Err(ConfigError::Syntax { line: line_no });
            }
            current = name.to_string();
            sections.entry(current.clone()).or_default();
            continue;
        }
        let Some(eq) = line.find('=') else {
            return Err(ConfigError::Syntax { line: line_no });
        };
        let key = line[..eq].trim();
        if key.is_empty() || !valid_chars(key, false) {
            return Err(ConfigError::Syntax { line: line_no });
        }
        let value = parse_value(line[eq + 1..].trim()).map_err(|e| match e {
            ValErr::Bad => ConfigError::BadValue { line: line_no },
            ValErr::Escape => ConfigError::BadEscape { line: line_no },
        })?;
        let sec = sections.entry(current.clone()).or_default();
        if sec.contains_key(key) {
            return Err(ConfigError::DuplicateKey {
                line: line_no,
                key: key.to_string(),
            });
        }
        sec.insert(key.to_string(), value);
    }

    for (name, val) in env {
        let mut parsed: Option<Value> = None;
        for (sname, keys) in sections.iter_mut() {
            for (k, slot) in keys.iter_mut() {
                let env_name = if sname.is_empty() {
                    format!("APP_{}", k.to_ascii_uppercase())
                } else {
                    format!(
                        "APP_{}_{}",
                        sname.replace('.', "_").to_ascii_uppercase(),
                        k.to_ascii_uppercase()
                    )
                };
                if env_name == *name {
                    if parsed.is_none() {
                        parsed = Some(
                            parse_value(val.trim())
                                .map_err(|_| ConfigError::BadEnv(name.clone()))?,
                        );
                    }
                    *slot = parsed.clone().unwrap();
                }
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
