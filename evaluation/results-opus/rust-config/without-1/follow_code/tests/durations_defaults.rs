use rustconfig::{parse, parse_with_defaults, ConfigError, Value};
use std::collections::BTreeMap;
use std::time::Duration;

fn value_of(text: &str) -> Result<Value, ConfigError> {
    parse(&format!("v = {text}\n"), &BTreeMap::new(), &[]).map(|c| c.get("v").unwrap().clone())
}

#[test]
fn parses_durations() {
    assert_eq!(value_of("250ms"), Ok(Value::Duration(Duration::from_millis(250))));
    assert_eq!(value_of("30s"), Ok(Value::Duration(Duration::from_secs(30))));
    assert_eq!(value_of("5m"), Ok(Value::Duration(Duration::from_secs(300))));
    assert_eq!(value_of("1h"), Ok(Value::Duration(Duration::from_secs(3600))));
    assert_eq!(value_of("0s"), Ok(Value::Duration(Duration::ZERO)));
    assert_eq!(
        value_of("18446744073709551615ms"),
        Ok(Value::Duration(Duration::from_millis(u64::MAX)))
    );
    assert_eq!(
        value_of("18446744073709551615s"),
        Ok(Value::Duration(Duration::from_secs(u64::MAX)))
    );
    assert_eq!(
        value_of("[1s, 250ms]"),
        Ok(Value::List(vec![
            Value::Duration(Duration::from_secs(1)),
            Value::Duration(Duration::from_millis(250)),
        ]))
    );
    // Existing scalars are unaffected.
    assert_eq!(value_of("42"), Ok(Value::Int(42)));
    assert_eq!(value_of("\"5s\""), Ok(Value::Str("5s".to_string())));
}

#[test]
fn rejects_near_durations() {
    for bad in [
        "5 s", "-5s", "+5s", "1.5h", "5S", "5MS", "5d", "s", "ms", "m", "h", "5sm", "5mss",
        "18446744073709551616ms", "18446744073709551616s", "307445734561825861m",
        "5124095576030432h",
    ] {
        assert_eq!(value_of(bad), Err(ConfigError::BadValue { line: 1 }), "{bad}");
    }
    assert_eq!(
        value_of("307445734561825860m"),
        Ok(Value::Duration(Duration::from_secs(307445734561825860 * 60)))
    );
}

#[test]
fn env_can_set_durations() {
    let mut env = BTreeMap::new();
    env.insert("APP_T".to_string(), "5m".to_string());
    let config = parse("t = 1\n", &env, &[]).unwrap();
    assert_eq!(config.get("t"), Some(&Value::Duration(Duration::from_secs(300))));
    env.insert("APP_T".to_string(), "5 m".to_string());
    assert_eq!(parse("t = 1\n", &env, &[]), Err(ConfigError::BadEnv("APP_T".to_string())));
}

#[test]
fn defaults_fill_missing_names_only() {
    let defaults = [
        ("server.port", Value::Int(1)),
        ("server.host", Value::Str("h".to_string())),
        ("server.host", Value::Str("ignored".to_string())),
        ("cache.ttl", Value::Duration(Duration::from_secs(60))),
        ("name", Value::Bool(true)),
    ];
    let config = parse_with_defaults(
        "[server]\nport = 8080\n",
        &BTreeMap::new(),
        &["server.host", "cache.ttl", "name"],
        &defaults,
    )
    .unwrap();
    assert_eq!(config.get("server.port"), Some(&Value::Int(8080)));
    assert_eq!(config.get("server.host"), Some(&Value::Str("h".to_string())));
    assert_eq!(config.get("cache.ttl"), Some(&Value::Duration(Duration::from_secs(60))));
    assert_eq!(config.get("name"), Some(&Value::Bool(true)));
}

#[test]
fn env_overrides_defaults() {
    let mut env = BTreeMap::new();
    env.insert("APP_CACHE_TTL".to_string(), "250ms".to_string());
    let defaults = [("cache.ttl", Value::Int(5))];
    let config = parse_with_defaults("", &env, &["cache.ttl"], &defaults).unwrap();
    assert_eq!(config.get("cache.ttl"), Some(&Value::Duration(Duration::from_millis(250))));
}

#[test]
fn text_errors_come_first_and_missing_still_reported() {
    let defaults = [("a", Value::Int(1))];
    assert_eq!(
        parse_with_defaults("x = 5d\n", &BTreeMap::new(), &[], &defaults),
        Err(ConfigError::BadValue { line: 1 })
    );
    assert_eq!(
        parse_with_defaults("", &BTreeMap::new(), &["b"], &defaults),
        Err(ConfigError::MissingRequired("b".to_string()))
    );
}
