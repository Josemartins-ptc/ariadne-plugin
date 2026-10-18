use rustconfig::{parse, parse_with_defaults, ConfigError, Value};
use std::collections::BTreeMap;
use std::time::Duration;

fn value(text: &str) -> Result<Value, ConfigError> {
    let config = parse(&format!("v = {text}\n"), &BTreeMap::new(), &[])?;
    Ok(config.get("v").unwrap().clone())
}

#[test]
fn parses_durations() {
    let cases = [
        ("250ms", Duration::from_millis(250)),
        ("30s", Duration::from_secs(30)),
        ("5m", Duration::from_secs(300)),
        ("1h", Duration::from_secs(3600)),
        ("0s", Duration::ZERO),
        ("18446744073709551615ms", Duration::from_millis(u64::MAX)),
        ("18446744073709551615s", Duration::from_secs(u64::MAX)),
    ];
    for (text, expected) in cases {
        assert_eq!(value(text), Ok(Value::Duration(expected)), "{text}");
    }
}

#[test]
fn rejects_near_durations() {
    for text in [
        "5 s", "-5s", "+5s", "1.5h", "5S", "5d", "s", "ms", "5Ms", "5mS", "18446744073709551616s",
        "18446744073709551616ms", "307445734561825861m", "5124095576030432h", "5sm", "5hs",
    ] {
        assert_eq!(value(text), Err(ConfigError::BadValue { line: 1 }), "{text}");
    }
    // The largest values that still fit.
    assert!(value("307445734561825860m").is_ok());
    assert!(value("5124095576030431h").is_ok());
}

#[test]
fn durations_in_lists_and_env() {
    assert_eq!(
        value("[1s, 250ms]"),
        Ok(Value::List(vec![
            Value::Duration(Duration::from_secs(1)),
            Value::Duration(Duration::from_millis(250)),
        ]))
    );
    assert_eq!(value("[1s, 5 s]"), Err(ConfigError::BadValue { line: 1 }));

    let mut env = BTreeMap::new();
    env.insert("APP_T".to_string(), "2m".to_string());
    let config = parse("t = 1\n", &env, &[]).unwrap();
    assert_eq!(config.get("t"), Some(&Value::Duration(Duration::from_secs(120))));

    env.insert("APP_T".to_string(), "2M".to_string());
    assert_eq!(parse("t = 1\n", &env, &[]), Err(ConfigError::BadEnv("APP_T".to_string())));
}

#[test]
fn defaults_fill_missing_names_only() {
    let defaults = [
        ("server.port", Value::Int(1)),
        ("server.host", Value::Str("h".to_string())),
        ("server.host", Value::Str("ignored".to_string())),
        ("cache.ttl", Value::Duration(Duration::from_secs(5))),
        ("root", Value::Bool(true)),
        ("a.b.c", Value::Int(7)),
    ];
    let config = parse_with_defaults(
        "[server]\nport = 8080\n",
        &BTreeMap::new(),
        &["server.host", "cache.ttl", "root", "a.b.c"],
        &defaults,
    )
    .unwrap();
    assert_eq!(config.get("server.port"), Some(&Value::Int(8080)));
    assert_eq!(config.get("server.host"), Some(&Value::Str("h".to_string())));
    assert_eq!(config.get("cache.ttl"), Some(&Value::Duration(Duration::from_secs(5))));
    assert_eq!(config.get("root"), Some(&Value::Bool(true)));
    assert_eq!(config.get("a.b.c"), Some(&Value::Int(7)));
}

#[test]
fn env_overrides_defaults_and_text_errors_come_first() {
    let mut env = BTreeMap::new();
    env.insert("APP_CACHE_TTL".to_string(), "250ms".to_string());
    let defaults = [("cache.ttl", Value::Duration(Duration::from_secs(5)))];
    let config = parse_with_defaults("", &env, &[], &defaults).unwrap();
    assert_eq!(config.get("cache.ttl"), Some(&Value::Duration(Duration::from_millis(250))));

    assert_eq!(
        parse_with_defaults("x = 5d\n", &env, &["missing"], &defaults),
        Err(ConfigError::BadValue { line: 1 })
    );
    assert_eq!(
        parse_with_defaults("", &BTreeMap::new(), &["missing"], &defaults),
        Err(ConfigError::MissingRequired("missing".to_string()))
    );
}
