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

/// Parses `text`, applies the overrides in `env`, then checks that every name in `required` exists.
pub fn parse(
    text: &str,
    env: &BTreeMap<String, String>,
    required: &[&str],
) -> Result<Config, ConfigError> {
    parse_with_defaults(text, env, required, &[])
}

/// Like [`parse`], but first fills in `defaults` (dotted name, value) for names the text does not define.
pub fn parse_with_defaults(
    text: &str,
    env: &BTreeMap<String, String>,
    required: &[&str],
    defaults: &[(&str, Value)],
) -> Result<Config, ConfigError> {
    let mut config = parse_text(text)?;
    apply_defaults(&mut config, defaults);
    apply_env(&mut config, env)?;
    check_required(&config, required)?;
    Ok(config)
}

fn apply_defaults(config: &mut Config, defaults: &[(&str, Value)]) {
    for (name, value) in defaults {
        let (section, key) = split_dotted(name);
        config
            .sections
            .entry(section.to_string())
            .or_default()
            .entry(key.to_string())
            .or_insert_with(|| value.clone());
    }
}

fn split_dotted(dotted: &str) -> (&str, &str) {
    match dotted.rfind('.') {
        Some(i) => (&dotted[..i], &dotted[i + 1..]),
        None => ("", dotted),
    }
}

fn parse_text(text: &str) -> Result<Config, ConfigError> {
    let mut sections: BTreeMap<String, BTreeMap<String, Value>> = BTreeMap::new();
    let mut current = String::new();
    for (idx, raw) in text.split('\n').enumerate() {
        let line_no = idx + 1;
        let line = raw.trim();
        if line.is_empty() || line.starts_with(';') || line.starts_with('#') {
            continue;
        }
        if line.starts_with('[') {
            current = parse_header(line).ok_or(ConfigError::Syntax { line: line_no })?;
            continue;
        }
        let (key, value_text) =
            parse_assignment(line).ok_or(ConfigError::Syntax { line: line_no })?;
        let value = parse_value(value_text).map_err(|e| e.at(line_no))?;
        let section = sections.entry(current.clone()).or_default();
        if section.contains_key(key) {
            return Err(ConfigError::DuplicateKey {
                line: line_no,
                key: key.to_string(),
            });
        }
        section.insert(key.to_string(), value);
    }
    Ok(Config { sections })
}

fn parse_header(line: &str) -> Option<String> {
    if line.len() < 2 || !line.ends_with(']') {
        return None;
    }
    let name = &line[1..line.len() - 1];
    let valid = !name.is_empty()
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '.');
    if valid {
        Some(name.to_string())
    } else {
        None
    }
}

fn parse_assignment(line: &str) -> Option<(&str, &str)> {
    let eq = line.find('=')?;
    let key = line[..eq].trim();
    let valid = !key.is_empty() && key.chars().all(|c| c.is_ascii_alphanumeric() || c == '_');
    if valid {
        Some((key, line[eq + 1..].trim()))
    } else {
        None
    }
}

fn parse_value(text: &str) -> Result<Value, ValueError> {
    if text.starts_with('[') {
        parse_list(text)
    } else {
        parse_scalar(text)
    }
}

fn parse_list(text: &str) -> Result<Value, ValueError> {
    if text.len() < 2 || !text.ends_with(']') {
        return Err(ValueError::Bad);
    }
    let inner = text[1..text.len() - 1].trim();
    if inner.is_empty() {
        return Ok(Value::List(Vec::new()));
    }
    let mut items = Vec::new();
    for item in split_items(inner) {
        let item = item.trim();
        if item.is_empty() || item.starts_with('[') {
            return Err(ValueError::Bad);
        }
        items.push(parse_scalar(item)?);
    }
    Ok(Value::List(items))
}

fn split_items(inner: &str) -> Vec<&str> {
    let mut items = Vec::new();
    let mut start = 0;
    let mut in_string = false;
    let mut escaped = false;
    for (i, c) in inner.char_indices() {
        if escaped {
            escaped = false;
        } else if in_string && c == '\\' {
            escaped = true;
        } else if c == '"' {
            in_string = !in_string;
        } else if c == ',' && !in_string {
            items.push(&inner[start..i]);
            start = i + 1;
        }
    }
    items.push(&inner[start..]);
    items
}

fn parse_scalar(text: &str) -> Result<Value, ValueError> {
    if text.starts_with('"') {
        return parse_string(text);
    }
    match text {
        "true" => return Ok(Value::Bool(true)),
        "false" => return Ok(Value::Bool(false)),
        _ => {}
    }
    if let Some(duration) = parse_duration(text) {
        return Ok(Value::Duration(duration));
    }
    parse_int(text)
}

fn parse_duration(text: &str) -> Option<Duration> {
    let (digits, unit) = if let Some(d) = text.strip_suffix("ms") {
        (d, "ms")
    } else if let Some(d) = text.strip_suffix('s') {
        (d, "s")
    } else if let Some(d) = text.strip_suffix('m') {
        (d, "m")
    } else if let Some(d) = text.strip_suffix('h') {
        (d, "h")
    } else {
        return None;
    };
    if digits.is_empty() || !digits.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }
    let n: u64 = digits.parse().ok()?;
    match unit {
        "ms" => Some(Duration::from_millis(n)),
        "s" => Some(Duration::from_secs(n)),
        "m" => n.checked_mul(60).map(Duration::from_secs),
        _ => n.checked_mul(3600).map(Duration::from_secs),
    }
}

fn parse_int(text: &str) -> Result<Value, ValueError> {
    let digits = text
        .strip_prefix('+')
        .or_else(|| text.strip_prefix('-'))
        .unwrap_or(text);
    if digits.is_empty() || !digits.chars().all(|c| c.is_ascii_digit()) {
        return Err(ValueError::Bad);
    }
    text.parse::<i64>().map(Value::Int).map_err(|_| ValueError::Bad)
}

fn parse_string(text: &str) -> Result<Value, ValueError> {
    let mut chars = text[1..].chars();
    let mut out = String::new();
    loop {
        match chars.next() {
            None => return Err(ValueError::Bad),
            Some('\\') => match chars.next() {
                Some('"') => out.push('"'),
                Some('\\') => out.push('\\'),
                Some('n') => out.push('\n'),
                Some('t') => out.push('\t'),
                Some(_) => return Err(ValueError::Escape),
                None => return Err(ValueError::Bad),
            },
            Some('"') => {
                return if chars.as_str().is_empty() {
                    Ok(Value::Str(out))
                } else {
                    Err(ValueError::Bad)
                };
            }
            Some(c) => out.push(c),
        }
    }
}

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

fn apply_env(config: &mut Config, env: &BTreeMap<String, String>) -> Result<(), ConfigError> {
    for (name, raw) in env {
        let mut targets: Vec<(String, String)> = Vec::new();
        for (section, keys) in &config.sections {
            for key in keys.keys() {
                if env_name(section, key) == *name {
                    targets.push((section.clone(), key.clone()));
                }
            }
        }
        if targets.is_empty() {
            continue;
        }
        let value = parse_value(raw.trim()).map_err(|_| ConfigError::BadEnv(name.clone()))?;
        for (section, key) in targets {
            if let Some(keys) = config.sections.get_mut(&section) {
                keys.insert(key, value.clone());
            }
        }
    }
    Ok(())
}

fn check_required(config: &Config, required: &[&str]) -> Result<(), ConfigError> {
    for name in required {
        if config.get(name).is_none() {
            return Err(ConfigError::MissingRequired(name.to_string()));
        }
    }
    Ok(())
}
