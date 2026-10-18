use rustconfig::{parse, ConfigError, Value};
use std::collections::BTreeMap;

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

#[test]
fn parses_durations() {
    use std::time::Duration;
    let text = "a = 250ms\nb = [1s, 5m, 1h, 0s]\nc = 18446744073709551615ms\nd = 18446744073709551615s\n";
    let config = parse(text, &BTreeMap::new(), &[]).unwrap();
    assert_eq!(config.get("a"), Some(&Value::Duration(Duration::from_millis(250))));
    assert_eq!(
        config.get("b"),
        Some(&Value::List(vec![
            Value::Duration(Duration::from_secs(1)),
            Value::Duration(Duration::from_secs(300)),
            Value::Duration(Duration::from_secs(3600)),
            Value::Duration(Duration::from_secs(0)),
        ]))
    );
    assert_eq!(config.get("c"), Some(&Value::Duration(Duration::from_millis(u64::MAX))));
    assert_eq!(config.get("d"), Some(&Value::Duration(Duration::from_secs(u64::MAX))));
}

#[test]
fn rejects_malformed_durations() {
    let bad = [
        "5 s", "-5s", "+5s", "1.5h", "5S", "5d", "s", "ms", "m", "5Ms",
        "18446744073709551616ms", "18446744073709551615m", "307445734561825861h", "[1s, 5 s]",
    ];
    for value in bad {
        let err = parse(&format!("v = {value}\n"), &BTreeMap::new(), &[]).unwrap_err();
        assert_eq!(err, ConfigError::BadValue { line: 1 }, "{value}");
    }
}

#[test]
fn duration_env_override() {
    use std::time::Duration;
    let mut env = BTreeMap::new();
    env.insert("APP_T".to_string(), "5m".to_string());
    let config = parse("t = 1\n", &env, &[]).unwrap();
    assert_eq!(config.get("t"), Some(&Value::Duration(Duration::from_secs(300))));
    env.insert("APP_T".to_string(), "5 m".to_string());
    assert_eq!(
        parse("t = 1\n", &env, &[]).unwrap_err(),
        ConfigError::BadEnv("APP_T".to_string())
    );
}

#[test]
fn defaults_have_lowest_precedence() {
    use rustconfig::parse_with_defaults;
    let mut env = BTreeMap::new();
    env.insert("APP_NEW_Z".to_string(), "7".to_string());
    let defaults = [
        ("a", Value::Int(0)),
        ("new.z", Value::Int(1)),
        ("new.z", Value::Int(2)),
        ("x.k2", Value::Bool(true)),
        ("x.k3", Value::Int(3)),
    ];
    let config =
        parse_with_defaults("a = 1\n[x]\nk = 1\n", &env, &["new.z", "x.k2"], &defaults).unwrap();
    assert_eq!(config.get("a"), Some(&Value::Int(1)));
    assert_eq!(config.get("new.z"), Some(&Value::Int(7)));
    assert_eq!(config.get("x.k2"), Some(&Value::Bool(true)));
    assert_eq!(config.get("x.k3"), Some(&Value::Int(3)));
    let config = parse_with_defaults("", &BTreeMap::new(), &[], &defaults).unwrap();
    assert_eq!(config.get("new.z"), Some(&Value::Int(1)));
    assert_eq!(
        parse_with_defaults("", &BTreeMap::new(), &["q"], &defaults).unwrap_err(),
        ConfigError::MissingRequired("q".to_string())
    );
}
