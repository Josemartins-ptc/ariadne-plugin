use rustconfig::{parse, parse_with_defaults, ConfigError, Value};
use std::collections::BTreeMap;
use std::time::Duration;

#[test]
fn parses_root_and_section_values() {
    let text = "name = \"demo\"\n\n[server]\nport = 8080\ndebug = true\ntags = [1, \"a\"]\n";
    let config = parse(text, &BTreeMap::new(), &[]).unwrap();
    assert_eq!(config.get("name"), Some(&Value::Str("demo".to_string())));
    assert_eq!(config.get("server.port"), Some(&Value::Int(8080)));
    assert_eq!(config.get("server.debug"), Some(&Value::Bool(true)));
    assert_eq!(
        config.get("server.tags"),
        Some(&Value::List(vec![Value::Int(1), Value::Str("a".to_string())]))
    );
}

#[test]
fn env_overrides_an_existing_key() {
    let mut env = BTreeMap::new();
    env.insert("APP_SERVER_PORT".to_string(), "9090".to_string());
    let config = parse("[server]\nport = 8080\n", &env, &["server.port"]).unwrap();
    assert_eq!(config.get("server.port"), Some(&Value::Int(9090)));
}

#[test]
fn duplicate_key_is_reported_on_its_second_line() {
    let err = parse("[db]\nhost = \"a\"\nhost = \"b\"\n", &BTreeMap::new(), &[]).unwrap_err();
    assert_eq!(
        err,
        ConfigError::DuplicateKey { line: 3, key: "host".to_string() }
    );
}

fn parse_x(value: &str) -> Result<Option<Value>, ConfigError> {
    parse(&format!("x = {}", value), &BTreeMap::new(), &[]).map(|c| c.get("x").cloned())
}

#[test]
fn parses_durations() {
    let secs = |n| Some(Value::Duration(Duration::from_secs(n)));
    assert_eq!(parse_x("250ms"), Ok(Some(Value::Duration(Duration::from_millis(250)))));
    assert_eq!(parse_x("0s"), Ok(secs(0)));
    assert_eq!(parse_x("30s"), Ok(secs(30)));
    assert_eq!(parse_x("5m"), Ok(secs(300)));
    assert_eq!(parse_x("1h"), Ok(secs(3600)));
    assert_eq!(parse_x("18446744073709551615s"), Ok(secs(u64::MAX)));
    assert_eq!(
        parse_x("[1s, 250ms]"),
        Ok(Some(Value::List(vec![
            Value::Duration(Duration::from_secs(1)),
            Value::Duration(Duration::from_millis(250)),
        ])))
    );
}

#[test]
fn rejects_malformed_durations() {
    for bad in [
        "5 s", "-5s", "+5s", "1.5h", "5S", "5d", "s", "ms", "5Ms", "5sm",
        "18446744073709551616ms", "307445734561825861m", "5124095576030432h",
    ] {
        assert_eq!(parse_x(bad), Err(ConfigError::BadValue { line: 1 }), "{}", bad);
    }
}

#[test]
fn defaults_fill_missing_keys_below_text_and_env() {
    let mut env = BTreeMap::new();
    env.insert("APP_NET_TIMEOUT".to_string(), "2s".to_string());
    let defaults = [
        ("net.timeout", Value::Int(1)),
        ("port", Value::Int(80)),
        ("port", Value::Int(81)),
        ("name", Value::Int(0)),
    ];
    let config =
        parse_with_defaults("name = \"a\"", &env, &["net.timeout", "port"], &defaults).unwrap();
    assert_eq!(config.get("net.timeout"), Some(&Value::Duration(Duration::from_secs(2))));
    assert_eq!(config.get("port"), Some(&Value::Int(80)));
    assert_eq!(config.get("name"), Some(&Value::Str("a".to_string())));

    env.insert("APP_PORT".to_string(), "5x".to_string());
    assert_eq!(
        parse_with_defaults("", &env, &[], &defaults),
        Err(ConfigError::BadEnv("APP_PORT".to_string()))
    );
}
