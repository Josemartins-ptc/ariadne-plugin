use rustconfig::{parse, parse_with_defaults, ConfigError, Value};
use std::collections::BTreeMap;
use std::time::Duration;

fn no_env() -> BTreeMap<String, String> {
    BTreeMap::new()
}

fn value_of(text: &str) -> Result<Option<Value>, ConfigError> {
    parse(&format!("v = {text}\n"), &no_env(), &[]).map(|c| c.get("v").cloned())
}

#[test]
fn parses_durations() {
    let cases = [
        ("250ms", Duration::from_millis(250)),
        ("30s", Duration::from_secs(30)),
        ("5m", Duration::from_secs(300)),
        ("1h", Duration::from_secs(3600)),
        ("0s", Duration::ZERO),
        ("007s", Duration::from_secs(7)),
        ("18446744073709551615ms", Duration::from_millis(u64::MAX)),
        ("18446744073709551615s", Duration::from_secs(u64::MAX)),
    ];
    for (text, expected) in cases {
        assert_eq!(value_of(text), Ok(Some(Value::Duration(expected))), "{text}");
    }
}

#[test]
fn rejects_near_durations() {
    for text in [
        "5 s", "-5s", "+5s", "1.5h", "5S", "5MS", "5d", "s", "ms", "m", "h", "5mss", "5sm",
        "18446744073709551616ms", "18446744073709551616s",
        "307445734561825861m", // 1 more than u64::MAX / 60
        "5124095576030432h",   // 1 more than u64::MAX / 3600
        "\u{0665}s",
    ] {
        assert_eq!(value_of(text), Err(ConfigError::BadValue { line: 1 }), "{text}");
    }
    // Plain integers are unaffected.
    assert_eq!(value_of("5"), Ok(Some(Value::Int(5))));
}

#[test]
fn durations_in_lists_and_env() {
    assert_eq!(
        value_of("[1s, 250ms]"),
        Ok(Some(Value::List(vec![
            Value::Duration(Duration::from_secs(1)),
            Value::Duration(Duration::from_millis(250)),
        ])))
    );
    assert_eq!(value_of("[1s, 5 s]"), Err(ConfigError::BadValue { line: 1 }));

    let mut env = BTreeMap::new();
    env.insert("APP_T".to_string(), " 2m ".to_string());
    let config = parse("t = 1\n", &env, &[]).unwrap();
    assert_eq!(config.get("t"), Some(&Value::Duration(Duration::from_secs(120))));

    env.insert("APP_T".to_string(), "2 m".to_string());
    assert_eq!(parse("t = 1\n", &env, &[]), Err(ConfigError::BadEnv("APP_T".to_string())));
}

#[test]
fn defaults_fill_missing_names_only() {
    let defaults = [
        ("server.port", Value::Int(80)),
        ("server.host", Value::Str("localhost".to_string())),
        ("server.host", Value::Str("ignored".to_string())),
        ("name", Value::Str("default".to_string())),
        ("cache.ttl", Value::Duration(Duration::from_secs(60))),
        ("a.b.c", Value::Bool(true)),
    ];
    let config =
        parse_with_defaults("name = \"x\"\n[server]\nport = 8080\n", &no_env(), &[], &defaults)
            .unwrap();
    assert_eq!(config.get("server.port"), Some(&Value::Int(8080)));
    assert_eq!(config.get("server.host"), Some(&Value::Str("localhost".to_string())));
    assert_eq!(config.get("name"), Some(&Value::Str("x".to_string())));
    assert_eq!(config.get("cache.ttl"), Some(&Value::Duration(Duration::from_secs(60))));
    assert_eq!(config.get("a.b.c"), Some(&Value::Bool(true)));
}

#[test]
fn defaults_are_not_validated() {
    let nested = Value::List(vec![Value::List(vec![])]);
    let config = parse_with_defaults("", &no_env(), &[], &[("x", nested.clone())]).unwrap();
    assert_eq!(config.get("x"), Some(&nested));
}

#[test]
fn env_overrides_defaults_and_required_sees_them() {
    let mut env = BTreeMap::new();
    env.insert("APP_DB_TIMEOUT".to_string(), "5s".to_string());
    let config = parse_with_defaults(
        "",
        &env,
        &["db.timeout", "db.host"],
        &[("db.timeout", Value::Int(1)), ("db.host", Value::Str("h".to_string()))],
    )
    .unwrap();
    assert_eq!(config.get("db.timeout"), Some(&Value::Duration(Duration::from_secs(5))));
    assert_eq!(config.get("db.host"), Some(&Value::Str("h".to_string())));

    assert_eq!(
        parse_with_defaults("", &env, &["db.port"], &[("db.timeout", Value::Int(1))]),
        Err(ConfigError::MissingRequired("db.port".to_string()))
    );
}

#[test]
fn text_errors_come_first() {
    assert_eq!(
        parse_with_defaults("bad", &no_env(), &[], &[("x", Value::Int(1))]),
        Err(ConfigError::Syntax { line: 1 })
    );
}

#[test]
fn parse_matches_empty_defaults() {
    let mut env = BTreeMap::new();
    env.insert("APP_S_K".to_string(), "3".to_string());
    for (text, required) in [
        ("[s]\nk = 1\n", &["s.k"][..]),
        ("[s]\nk = 1\n", &["s.missing"][..]),
        ("k = \"\\q\"\n", &[][..]),
    ] {
        assert_eq!(parse(text, &env, required), parse_with_defaults(text, &env, required, &[]));
    }
}
