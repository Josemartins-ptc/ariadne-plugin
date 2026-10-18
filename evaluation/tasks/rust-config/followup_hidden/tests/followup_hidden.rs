use rustconfig::{parse, parse_with_defaults, ConfigError, Value};
use std::collections::BTreeMap;
use std::time::Duration;

fn no_env() -> BTreeMap<String, String> {
    BTreeMap::new()
}

fn env(pairs: &[(&str, &str)]) -> BTreeMap<String, String> {
    pairs
        .iter()
        .map(|(k, v)| (k.to_string(), v.to_string()))
        .collect()
}

fn secs(n: u64) -> Value {
    Value::Duration(Duration::from_secs(n))
}

#[test]
fn duration_units_are_parsed() {
    let text = "a = 250ms\nb = 30s\nc = 5m\nd = 2h\n";
    let config = parse(text, &no_env(), &[]).unwrap();
    assert_eq!(config.get("a"), Some(&Value::Duration(Duration::from_millis(250))));
    assert_eq!(config.get("b"), Some(&secs(30)));
    assert_eq!(config.get("c"), Some(&secs(300)));
    assert_eq!(config.get("d"), Some(&secs(7200)));
}

#[test]
fn zero_and_leading_zero_durations_are_allowed() {
    let config = parse("a = 0s\nb = 007m\n", &no_env(), &[]).unwrap();
    assert_eq!(config.get("a"), Some(&secs(0)));
    assert_eq!(config.get("b"), Some(&secs(420)));
}

#[test]
fn malformed_durations_are_bad_value() {
    for value in ["5 s", "-5s", "+5s", "1.5h", "5S", "5d", "s", "ms", "5sm"] {
        let text = format!("[t]\nk = {}\n", value);
        let err = parse(&text, &no_env(), &[]).unwrap_err();
        assert_eq!(err, ConfigError::BadValue { line: 2 }, "value {:?}", value);
    }
}

#[test]
fn duration_overflow_is_bad_value() {
    for value in ["18446744073709551616s", "18446744073709551615h", "307445734561825861m"] {
        let text = format!("k = {}\n", value);
        let err = parse(&text, &no_env(), &[]).unwrap_err();
        assert_eq!(err, ConfigError::BadValue { line: 1 }, "value {:?}", value);
    }
}

#[test]
fn plain_integers_stay_integers() {
    let config = parse("a = 30\nb = -4\n", &no_env(), &[]).unwrap();
    assert_eq!(config.get("a"), Some(&Value::Int(30)));
    assert_eq!(config.get("b"), Some(&Value::Int(-4)));
}

#[test]
fn lists_may_hold_durations() {
    let config = parse("l = [1s, 250ms, 3, \"5m\"]\n", &no_env(), &[]).unwrap();
    assert_eq!(
        config.get("l"),
        Some(&Value::List(vec![
            secs(1),
            Value::Duration(Duration::from_millis(250)),
            Value::Int(3),
            Value::Str("5m".to_string()),
        ]))
    );
}

#[test]
fn env_override_may_be_a_duration() {
    let e = env(&[("APP_HTTP_TIMEOUT", " 2m ")]);
    let config = parse("[http]\ntimeout = 10s\n", &e, &[]).unwrap();
    assert_eq!(config.get("http.timeout"), Some(&secs(120)));
    let e = env(&[("APP_HTTP_TIMEOUT", "2 m")]);
    let err = parse("[http]\ntimeout = 10s\n", &e, &[]).unwrap_err();
    assert_eq!(err, ConfigError::BadEnv("APP_HTTP_TIMEOUT".to_string()));
}

#[test]
fn defaults_fill_missing_keys_including_new_sections() {
    let defaults = [
        ("name", Value::Str("svc".to_string())),
        ("cache.redis.ttl", secs(60)),
        ("http.port", Value::Int(80)),
    ];
    let config = parse_with_defaults("[http]\nhost = \"h\"\n", &no_env(), &[], &defaults).unwrap();
    assert_eq!(config.get("name"), Some(&Value::Str("svc".to_string())));
    assert_eq!(config.get("cache.redis.ttl"), Some(&secs(60)));
    assert_eq!(config.get("http.port"), Some(&Value::Int(80)));
    assert_eq!(config.get("http.host"), Some(&Value::Str("h".to_string())));
}

#[test]
fn text_values_beat_defaults() {
    let defaults = [("http.port", Value::Int(80))];
    let config = parse_with_defaults("[http]\nport = 8080\n", &no_env(), &[], &defaults).unwrap();
    assert_eq!(config.get("http.port"), Some(&Value::Int(8080)));
}

#[test]
fn earlier_default_wins_over_later_one_for_same_name() {
    let defaults = [("a.b", Value::Int(1)), ("a.b", Value::Int(2))];
    let config = parse_with_defaults("", &no_env(), &[], &defaults).unwrap();
    assert_eq!(config.get("a.b"), Some(&Value::Int(1)));
}

#[test]
fn env_overrides_keys_that_came_from_defaults() {
    let defaults = [("db.pool", Value::Int(5)), ("debug", Value::Bool(false))];
    let e = env(&[("APP_DB_POOL", "20"), ("APP_DEBUG", "true")]);
    let config = parse_with_defaults("", &e, &[], &defaults).unwrap();
    assert_eq!(config.get("db.pool"), Some(&Value::Int(20)));
    assert_eq!(config.get("debug"), Some(&Value::Bool(true)));
}

#[test]
fn defaults_count_for_required_names() {
    let defaults = [("db.pool", Value::Int(5))];
    let config = parse_with_defaults("", &no_env(), &["db.pool"], &defaults).unwrap();
    assert_eq!(config.get("db.pool"), Some(&Value::Int(5)));
    let err = parse_with_defaults("", &no_env(), &["db.pool", "db.host"], &defaults).unwrap_err();
    assert_eq!(err, ConfigError::MissingRequired("db.host".to_string()));
}

#[test]
fn text_errors_win_over_defaults() {
    let defaults = [("a", Value::Int(1))];
    let err = parse_with_defaults("a = oops\n", &no_env(), &[], &defaults).unwrap_err();
    assert_eq!(err, ConfigError::BadValue { line: 1 });
}

#[test]
fn parse_equals_parse_with_no_defaults() {
    let text = "a = 1s\n[x]\nb = [true, 2]\n";
    let e = env(&[("APP_X_B", "[3]")]);
    let plain = parse(text, &e, &["a"]).unwrap();
    let with = parse_with_defaults(text, &e, &["a"], &[]).unwrap();
    assert_eq!(plain, with);
    assert_eq!(plain.get("x.b"), Some(&Value::List(vec![Value::Int(3)])));
}
