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
    let mut env = BTreeMap::new();
    env.insert("APP_S_C".to_string(), "2m".to_string());
    let d = [
        ("a", Value::Int(1)),
        ("s.b", Value::Int(2)),
        ("s.c", Value::Int(3)),
        ("n.x", Value::Int(4)),
    ];
    let text = "a = 250ms\n[s]\nb = [1s, 1h]";
    let c = parse_with_defaults(text, &env, &["n.x", "s.c"], &d).unwrap();
    assert_eq!(c.get("a"), Some(&Value::Duration(Duration::from_millis(250))));
    assert_eq!(c.get("s.c"), Some(&Value::Duration(Duration::from_secs(120))));
    assert_eq!(c.get("n.x"), Some(&Value::Int(4)));
    let bads = ["5 s", "-5s", "+5s", "1.5h", "5S", "5d", "s", "ms",
        "18446744073709551616s", "307445734561825861m"];
    for bad in bads {
        let t = format!("k = {}", bad);
        assert!(parse(&t, &BTreeMap::new(), &[]).is_err(), "{}", bad);
    }
    assert!(parse("k = 18446744073709551615s", &BTreeMap::new(), &[]).is_ok());
}
