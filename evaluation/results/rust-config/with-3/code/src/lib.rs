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

fn parse_int(text: &str) -> Result<Value, ValueError> {
    let digits = text.strip_prefix(['+', '-']).unwrap_or(text);
    if digits.is_empty() || !digits.bytes().all(|b| b.is_ascii_digit()) {
        return Err(ValueError::Bad);
    }
    text.parse::<i64>().map(Value::Int).map_err(|_| ValueError::Bad)
}

fn unescape(next: Option<char>) -> Result<char, ValueError> {
    match next {
        Some('"') => Ok('"'),
        Some('\\') => Ok('\\'),
        Some('n') => Ok('\n'),
        Some('t') => Ok('\t'),
        Some(_) => Err(ValueError::Escape),
        None => Err(ValueError::Bad),
    }
}

fn parse_string(text: &str) -> Result<Value, ValueError> {
    let mut out = String::new();
    let mut chars = text.chars().skip(1);
    while let Some(c) = chars.next() {
        if c == '"' {
            return match chars.next() {
                None => Ok(Value::Str(out)),
                Some(_) => Err(ValueError::Bad),
            };
        }
        out.push(if c == '\\' { unescape(chars.next())? } else { c });
    }
    Err(ValueError::Bad)
}

fn parse_scalar(text: &str) -> Result<Value, ValueError> {
    if text == "true" {
        Ok(Value::Bool(true))
    } else if text == "false" {
        Ok(Value::Bool(false))
    } else if text.starts_with('"') {
        parse_string(text)
    } else {
        parse_int(text)
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

fn parse_value(text: &str) -> Result<Value, ValueError> {
    if !text.starts_with('[') {
        return parse_scalar(text);
    }
    let inner = text
        .strip_prefix('[')
        .and_then(|t| t.strip_suffix(']'))
        .ok_or(ValueError::Bad)?
        .trim();
    if inner.is_empty() {
        return Ok(Value::List(Vec::new()));
    }
    let items: Result<Vec<Value>, ValueError> =
        split_items(inner).into_iter().map(|item| parse_scalar(item.trim())).collect();
    items.map(Value::List)
}

fn valid_name(name: &str, allow_dot: bool) -> bool {
    !name.is_empty()
        && name
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || (allow_dot && b == b'.'))
}

fn env_name(section: &str, key: &str) -> String {
    let mut name = String::from("APP_");
    if !section.is_empty() {
        name.push_str(&section.replace('.', "_"));
        name.push('_');
    }
    name.push_str(key);
    name.to_ascii_uppercase()
}

type Sections = BTreeMap<String, BTreeMap<String, Value>>;

enum Line {
    Skip,
    Header(String),
    Assign(String, Value),
}

fn parse_header(t: &str) -> Option<String> {
    let name = t.strip_prefix('[')?.strip_suffix(']')?;
    valid_name(name, true).then(|| name.to_string())
}

fn parse_line(raw: &str, line: usize) -> Result<Line, ConfigError> {
    let t = raw.trim();
    if t.is_empty() || t.starts_with(';') || t.starts_with('#') {
        return Ok(Line::Skip);
    }
    if t.starts_with('[') {
        return parse_header(t).map(Line::Header).ok_or(ConfigError::Syntax { line });
    }
    let (k, v) = t.split_once('=').ok_or(ConfigError::Syntax { line })?;
    let key = k.trim();
    if !valid_name(key, false) {
        return Err(ConfigError::Syntax { line });
    }
    let value = parse_value(v.trim()).map_err(|e| match e {
        ValueError::Bad => ConfigError::BadValue { line },
        ValueError::Escape => ConfigError::BadEscape { line },
    })?;
    Ok(Line::Assign(key.to_string(), value))
}

fn read_sections(text: &str) -> Result<Sections, ConfigError> {
    let mut sections = Sections::new();
    let mut current = String::new();
    for (idx, raw) in text.split('\n').enumerate() {
        let line = idx + 1;
        match parse_line(raw, line)? {
            Line::Skip => {}
            Line::Header(name) => current = name,
            Line::Assign(key, value) => {
                let section = sections.entry(current.clone()).or_default();
                if section.contains_key(&key) {
                    return Err(ConfigError::DuplicateKey { line, key });
                }
                section.insert(key, value);
            }
        }
    }
    Ok(sections)
}

fn apply_env(sections: &mut Sections, env: &BTreeMap<String, String>) -> Result<(), ConfigError> {
    for (name, raw) in env {
        let mut slots = Vec::new();
        for (section, keys) in sections.iter_mut() {
            slots.extend(keys.iter_mut().filter(|(k, _)| env_name(section, k) == *name));
        }
        if slots.is_empty() {
            continue;
        }
        let value = parse_value(raw.trim()).map_err(|_| ConfigError::BadEnv(name.clone()))?;
        for (_, slot) in slots {
            *slot = value.clone();
        }
    }
    Ok(())
}

/// Parses `text`, applies the overrides in `env`, then checks that every name in `required` exists.
pub fn parse(
    text: &str,
    env: &BTreeMap<String, String>,
    required: &[&str],
) -> Result<Config, ConfigError> {
    let mut sections = read_sections(text)?;
    apply_env(&mut sections, env)?;
    let config = Config { sections };
    match required.iter().find(|name| config.get(name).is_none()) {
        Some(name) => Err(ConfigError::MissingRequired(name.to_string())),
        None => Ok(config),
    }
}
