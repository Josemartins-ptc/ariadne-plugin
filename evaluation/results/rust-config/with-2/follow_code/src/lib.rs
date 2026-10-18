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
    Duration(std::time::Duration),
}

type Sections = BTreeMap<String, BTreeMap<String, Value>>;

/// A parsed configuration.
#[derive(Debug, Clone, PartialEq)]
pub struct Config {
    sections: Sections,
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

/// Like [`parse`], but first fills in `defaults` for names missing from `text`.
/// Precedence: environment over text over defaults.
pub fn parse_with_defaults(
    text: &str,
    env: &BTreeMap<String, String>,
    required: &[&str],
    defaults: &[(&str, Value)],
) -> Result<Config, ConfigError> {
    let mut sections = read_text(text)?;
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
    for name in required {
        if config.get(name).is_none() {
            return Err(ConfigError::MissingRequired(name.to_string()));
        }
    }
    Ok(config)
}

fn read_text(text: &str) -> Result<Sections, ConfigError> {
    let mut sections = Sections::new();
    let mut current = String::new();
    sections.entry(current.clone()).or_default();
    for (idx, raw) in text.split('\n').enumerate() {
        let line = idx + 1;
        let t = raw.trim();
        if t.is_empty() || t.starts_with(';') || t.starts_with('#') {
            continue;
        }
        if t.starts_with('[') {
            current = parse_header(t).ok_or(ConfigError::Syntax { line })?;
            sections.entry(current.clone()).or_default();
            continue;
        }
        let (key, value) = parse_assignment(t, line)?;
        let sec = sections.entry(current.clone()).or_default();
        if sec.contains_key(&key) {
            return Err(ConfigError::DuplicateKey { line, key });
        }
        sec.insert(key, value);
    }
    Ok(sections)
}

fn parse_header(t: &str) -> Option<String> {
    let name = t.strip_prefix('[')?.strip_suffix(']')?;
    let valid = !name.is_empty()
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '.');
    valid.then(|| name.to_string())
}

fn parse_assignment(t: &str, line: usize) -> Result<(String, Value), ConfigError> {
    let (k, v) = t.split_once('=').ok_or(ConfigError::Syntax { line })?;
    let key = k.trim();
    if key.is_empty() || !key.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
        return Err(ConfigError::Syntax { line });
    }
    let value = parse_value(v.trim()).map_err(|e| match e {
        VErr::Bad => ConfigError::BadValue { line },
        VErr::Escape => ConfigError::BadEscape { line },
    })?;
    Ok((key.to_string(), value))
}

fn apply_env(sections: &mut Sections, env: &BTreeMap<String, String>) -> Result<(), ConfigError> {
    for (name, val) in env {
        let mut parsed: Option<Value> = None;
        for (sname, sec) in sections.iter_mut() {
            for (k, slot) in sec.iter_mut() {
                if env_name(sname, k) != *name {
                    continue;
                }
                if parsed.is_none() {
                    let v = parse_value(val.trim())
                        .map_err(|_| ConfigError::BadEnv(name.clone()))?;
                    parsed = Some(v);
                }
                slot.clone_from(parsed.as_ref().expect("parsed"));
            }
        }
    }
    Ok(())
}

fn split_dotted(dotted: &str) -> (&str, &str) {
    dotted.rsplit_once('.').unwrap_or(("", dotted))
}

fn env_name(section: &str, key: &str) -> String {
    let mut s = String::from("APP_");
    if !section.is_empty() {
        s.push_str(&section.replace('.', "_").to_ascii_uppercase());
        s.push('_');
    }
    s.push_str(&key.to_ascii_uppercase());
    s
}

enum VErr {
    Bad,
    Escape,
}

fn parse_value(s: &str) -> Result<Value, VErr> {
    if s.starts_with('[') {
        return parse_list(s);
    }
    parse_scalar(s)
}

fn parse_scalar(s: &str) -> Result<Value, VErr> {
    match s {
        "true" => Ok(Value::Bool(true)),
        "false" => Ok(Value::Bool(false)),
        _ if s.starts_with('"') => parse_string(s).map(Value::Str),
        _ => parse_duration(s).unwrap_or_else(|| parse_int(s)),
    }
}

/// Returns `None` if `s` does not end in a duration unit.
fn parse_duration(s: &str) -> Option<Result<Value, VErr>> {
    let (digits, unit) = if let Some(d) = s.strip_suffix("ms") {
        (d, "ms")
    } else if let Some(d) = s.strip_suffix('s') {
        (d, "s")
    } else if let Some(d) = s.strip_suffix('m') {
        (d, "m")
    } else {
        (s.strip_suffix('h')?, "h")
    };
    if digits.is_empty() || !digits.bytes().all(|b| b.is_ascii_digit()) {
        return Some(Err(VErr::Bad));
    }
    let Ok(n) = digits.parse::<u64>() else {
        return Some(Err(VErr::Bad));
    };
    let d = match unit {
        "ms" => Some(Duration::from_millis(n)),
        "s" => Some(Duration::from_secs(n)),
        "m" => n.checked_mul(60).map(Duration::from_secs),
        _ => n.checked_mul(3600).map(Duration::from_secs),
    };
    Some(d.map(Value::Duration).ok_or(VErr::Bad))
}

fn parse_int(s: &str) -> Result<Value, VErr> {
    let digits = s.strip_prefix(['+', '-']).unwrap_or(s);
    if digits.is_empty() || !digits.bytes().all(|b| b.is_ascii_digit()) {
        return Err(VErr::Bad);
    }
    s.parse::<i64>().map(Value::Int).map_err(|_| VErr::Bad)
}

fn parse_list(s: &str) -> Result<Value, VErr> {
    let inner = s
        .strip_prefix('[')
        .and_then(|r| r.strip_suffix(']'))
        .ok_or(VErr::Bad)?
        .trim();
    if inner.is_empty() {
        return Ok(Value::List(Vec::new()));
    }
    let mut items = Vec::new();
    for item in split_items(inner) {
        let item = item.trim();
        if item.is_empty() || item.starts_with('[') {
            return Err(VErr::Bad);
        }
        items.push(parse_scalar(item)?);
    }
    Ok(Value::List(items))
}

fn unescape(c: char) -> Option<char> {
    match c {
        '"' | '\\' => Some(c),
        'n' => Some('\n'),
        't' => Some('\t'),
        _ => None,
    }
}

fn parse_string(s: &str) -> Result<String, VErr> {
    let mut out = String::new();
    let mut chars = s.chars().skip(1);
    while let Some(c) = chars.next() {
        if c == '"' {
            return if chars.next().is_none() {
                Ok(out)
            } else {
                Err(VErr::Bad)
            };
        }
        if c != '\\' {
            out.push(c);
            continue;
        }
        let esc = chars.next().ok_or(VErr::Bad)?;
        out.push(unescape(esc).ok_or(VErr::Escape)?);
    }
    Err(VErr::Bad)
}

/// Splits list contents on commas that are not inside a string item.
fn split_items(inner: &str) -> Vec<&str> {
    let mut items = Vec::new();
    let mut start = 0;
    let mut in_str = false;
    let mut escaped = false;
    let mut item_start = true;
    for (i, c) in inner.char_indices() {
        if in_str {
            in_str = !(c == '"' && !escaped);
            escaped = c == '\\' && !escaped;
            continue;
        }
        if c == ',' {
            items.push(&inner[start..i]);
            start = i + 1;
            item_start = true;
            continue;
        }
        in_str = item_start && c == '"';
        item_start = item_start && c.is_whitespace();
    }
    items.push(&inner[start..]);
    items
}
