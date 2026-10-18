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
fn durations_and_defaults() {
    use rustconfig::parse_with_defaults;
    use std::time::Duration;
    let env = BTreeMap::new();
    let defaults = [("x.y", Value::Int(1)), ("b", Value::Int(2))];
    let c = parse_with_defaults("a=[1s, 250ms]\nb=0s", &env, &["x.y"], &defaults).unwrap();
    assert_eq!(c.get("b"), Some(&Value::Duration(Duration::ZERO)));
    assert_eq!(c.get("x.y"), Some(&Value::Int(1)));
    assert_eq!(
        c.get("a"),
        Some(&Value::List(vec![
            Value::Duration(Duration::from_secs(1)),
            Value::Duration(Duration::from_millis(250)),
        ]))
    );
    for bad in ["5 s", "-5s", "+5s", "1.5h", "5S", "5d", "s", "18446744073709551615m"] {
        let r = parse(&format!("a={bad}"), &env, &[]);
        assert!(matches!(r, Err(ConfigError::BadValue { .. })), "{bad}");
    }
    assert!(parse("a=18446744073709551615ms", &env, &[]).is_ok());
}
