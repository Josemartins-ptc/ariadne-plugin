use rustconfig::{parse, parse_with_defaults, ConfigError, Value};
use std::collections::BTreeMap;
use std::time::Duration;

fn value(text: &str) -> Result<Option<Value>, ConfigError> {
    parse(&format!("v = {text}\n"), &BTreeMap::new(), &[]).map(|c| c.get("v").cloned())
}

#[test]
fn parses_durations() {
    fn d(text: &str) -> Value {
        value(text).unwrap().unwrap()
    }
    assert_eq!(d("250ms"), Value::Duration(Duration::from_millis(250)));
    assert_eq!(d("30s"), Value::Duration(Duration::from_secs(30)));
    assert_eq!(d("5m"), Value::Duration(Duration::from_secs(300)));
    assert_eq!(d("1h"), Value::Duration(Duration::from_secs(3600)));
    assert_eq!(d("0s"), Value::Duration(Duration::ZERO));
    assert_eq!(d("18446744073709551615ms"), Value::Duration(Duration::from_millis(u64::MAX)));
    assert_eq!(d("18446744073709551615s"), Value::Duration(Duration::from_secs(u64::MAX)));
    for (unit, secs) in [("m", 60), ("h", 3600)] {
        let max = u64::MAX / secs;
        assert_eq!(
            d(&format!("{max}{unit}")),
            Value::Duration(Duration::from_secs(max * secs))
        );
        assert_eq!(value(&format!("{}{unit}", max + 1)), Err(ConfigError::BadValue { line: 1 }));
    }
    assert_eq!(
        d("[1s, 250ms]"),
        Value::List(vec![
            Value::Duration(Duration::from_secs(1)),
            Value::Duration(Duration::from_millis(250)),
        ])
    );
    assert_eq!(d("42"), Value::Int(42));
}

#[test]
fn rejects_near_durations() {
    for text in [
        "5 s", "-5s", "+5s", "1.5h", "5S", "5MS", "5d", "s", "ms", "5mss", "5sm",
        "18446744073709551616s", "18446744073709551616ms", "[1s, 5x]",
    ] {
        assert_eq!(value(text), Err(ConfigError::BadValue { line: 1 }), "{text}");
    }
}

#[test]
fn env_override_accepts_and_validates_durations() {
    let mut env = BTreeMap::new();
    env.insert("APP_T".to_string(), "5m".to_string());
    let config = parse("t = 1s\n", &env, &[]).unwrap();
    assert_eq!(config.get("t"), Some(&Value::Duration(Duration::from_secs(300))));
    env.insert("APP_T".to_string(), "5 m".to_string());
    assert_eq!(parse("t = 1s\n", &env, &[]), Err(ConfigError::BadEnv("APP_T".to_string())));
}

#[test]
fn defaults_fill_missing_names_only() {
    let mut env = BTreeMap::new();
    env.insert("APP_CACHE_TTL".to_string(), "10s".to_string());
    let defaults = [
        ("server.port", Value::Int(1)),
        ("server.host", Value::Str("localhost".to_string())),
        ("server.host", Value::Str("ignored".to_string())),
        ("name", Value::Str("default".to_string())),
        ("cache.ttl", Value::Duration(Duration::from_secs(1))),
        ("a.b.c", Value::Bool(true)),
    ];
    let config = parse_with_defaults(
        "[server]\nport = 8080\n",
        &env,
        &["server.host", "name", "cache.ttl", "a.b.c"],
        &defaults,
    )
    .unwrap();
    assert_eq!(config.get("server.port"), Some(&Value::Int(8080)));
    assert_eq!(config.get("server.host"), Some(&Value::Str("localhost".to_string())));
    assert_eq!(config.get("name"), Some(&Value::Str("default".to_string())));
    assert_eq!(config.get("cache.ttl"), Some(&Value::Duration(Duration::from_secs(10))));
    assert_eq!(config.get("a.b.c"), Some(&Value::Bool(true)));
}

#[test]
fn defaults_do_not_hide_text_errors_and_parse_matches_empty_defaults() {
    let defaults = [("x", Value::Int(1))];
    assert_eq!(
        parse_with_defaults("x = 5q\n", &BTreeMap::new(), &[], &defaults),
        Err(ConfigError::BadValue { line: 1 })
    );
    assert_eq!(
        parse_with_defaults("", &BTreeMap::new(), &["y"], &defaults),
        Err(ConfigError::MissingRequired("y".to_string()))
    );
    let text = "a = 1\n[s]\nb = 2s\n";
    assert_eq!(
        parse(text, &BTreeMap::new(), &["a"]),
        parse_with_defaults(text, &BTreeMap::new(), &["a"], &[])
    );
}
