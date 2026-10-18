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

fn split_dotted(dotted: &str) -> (&str, &str) {
    match dotted.rfind('.') {
        Some(i) => (&dotted[..i], &dotted[i + 1..]),
        None => ("", dotted),
    }
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

#[derive(Clone, Copy)]
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

/// `None` if `text` is not shaped like a duration (digits followed by a known unit).
fn parse_duration(text: &str) -> Option<Result<Value, ValueError>> {
    let split = text.bytes().position(|b| !b.is_ascii_digit())?;
    let (digits, unit) = text.split_at(split);
    let secs_per_unit: u64 = match unit {
        "ms" => 0,
        "s" => 1,
        "m" => 60,
        "h" => 3600,
        _ => return None,
    };
    if digits.is_empty() {
        return None;
    }
    let result = digits.parse::<u64>().map_err(|_| ValueError::Bad).and_then(|n| {
        if unit == "ms" {
            Ok(Duration::from_millis(n))
        } else {
            n.checked_mul(secs_per_unit).map(Duration::from_secs).ok_or(ValueError::Bad)
        }
    });
    Some(result.map(Value::Duration))
}

fn unescape(c: Option<char>) -> Result<char, ValueError> {
    match c {
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
    } else if let Some(d) = parse_duration(text) {
        d
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

fn parse_list(text: &str) -> Result<Value, ValueError> {
    if text.len() < 2 || !text.ends_with(']') {
        return Err(ValueError::Bad);
    }
    let inner = text[1..text.len() - 1].trim();
    if inner.is_empty() {
        return Ok(Value::List(Vec::new()));
    }
    split_items(inner)
        .into_iter()
        .map(|item| parse_scalar(item.trim()))
        .collect::<Result<Vec<_>, _>>()
        .map(Value::List)
}

fn parse_value(text: &str) -> Result<Value, ValueError> {
    if text.starts_with('[') {
        parse_list(text)
    } else {
        parse_scalar(text)
    }
}

fn valid_name(name: &str, extra: &[char]) -> bool {
    !name.is_empty()
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || extra.contains(&c))
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

type Sections = BTreeMap<String, BTreeMap<String, Value>>;

enum Line<'a> {
    Skip,
    Header(&'a str),
    Assign(&'a str, Value),
}

fn parse_header(t: &str) -> Option<&str> {
    let name = t.strip_prefix('[')?.strip_suffix(']')?;
    valid_name(name, &['.']).then_some(name)
}

fn classify(t: &str, line: usize) -> Result<Line<'_>, ConfigError> {
    if t.is_empty() || t.starts_with(';') || t.starts_with('#') {
        return Ok(Line::Skip);
    }
    if t.starts_with('[') {
        return parse_header(t).map(Line::Header).ok_or(ConfigError::Syntax { line });
    }
    let (k, v) = t.split_once('=').ok_or(ConfigError::Syntax { line })?;
    let key = k.trim();
    if !valid_name(key, &[]) {
        return Err(ConfigError::Syntax { line });
    }
    let value = parse_value(v.trim()).map_err(|e| match e {
        ValueError::Bad => ConfigError::BadValue { line },
        ValueError::Escape => ConfigError::BadEscape { line },
    })?;
    Ok(Line::Assign(key, value))
}

fn read_sections(text: &str) -> Result<Sections, ConfigError> {
    let mut sections = Sections::new();
    let mut current = String::new();
    sections.entry(current.clone()).or_default();
    for (idx, raw) in text.split('\n').enumerate() {
        let line = idx + 1;
        match classify(raw.trim(), line)? {
            Line::Skip => {}
            Line::Header(name) => {
                current = name.to_string();
                sections.entry(current.clone()).or_default();
            }
            Line::Assign(key, value) => {
                let section = sections.entry(current.clone()).or_default();
                if section.contains_key(key) {
                    return Err(ConfigError::DuplicateKey { line, key: key.to_string() });
                }
                section.insert(key.to_string(), value);
            }
        }
    }
    Ok(sections)
}

fn apply_env(sections: &mut Sections, env: &BTreeMap<String, String>) -> Result<(), ConfigError> {
    for (name, raw) in env {
        let targets: Vec<(String, String)> = sections
            .iter()
            .flat_map(|(s, keys)| keys.keys().map(move |k| (s.clone(), k.clone())))
            .filter(|(s, k)| env_name(s, k) == *name)
            .collect();
        if targets.is_empty() {
            continue;
        }
        let value = parse_value(raw.trim()).map_err(|_| ConfigError::BadEnv(name.clone()))?;
        for (s, k) in targets {
            sections.entry(s).or_default().insert(k, value.clone());
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
    parse_with_defaults(text, env, required, &[])
}

/// Like [`parse`], but first fills in `defaults` for names missing from the text.
/// Precedence: environment over text over defaults.
pub fn parse_with_defaults(
    text: &str,
    env: &BTreeMap<String, String>,
    required: &[&str],
    defaults: &[(&str, Value)],
) -> Result<Config, ConfigError> {
    let mut sections = read_sections(text)?;
    for (name, value) in defaults {
        let (section, key) = split_dotted(name);
        sections
            .entry(section.to_string())
            .or_default()
            .entry(key.to_string())
            .or_insert_with(|| value.clone());
    }
    apply_env(&mut sections, env)?;
    let config = Config { sections };
    match required.iter().find(|name| config.get(name).is_none()) {
        Some(name) => Err(ConfigError::MissingRequired(name.to_string())),
        None => Ok(config),
    }
}
