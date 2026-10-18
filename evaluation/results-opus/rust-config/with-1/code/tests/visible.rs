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
