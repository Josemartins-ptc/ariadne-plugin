use rustconfig::{parse, ConfigError, Value};
use std::collections::BTreeMap;

fn no_env() -> BTreeMap<String, String> {
    BTreeMap::new()
}

fn env(pairs: &[(&str, &str)]) -> BTreeMap<String, String> {
    pairs
        .iter()
        .map(|(k, v)| (k.to_string(), v.to_string()))
        .collect()
}

fn s(text: &str) -> Value {
    Value::Str(text.to_string())
}

#[test]
fn keys_before_any_section_belong_to_root() {
    let config = parse("a = 1\nb = true\n[x]\nc = 2\n", &no_env(), &[]).unwrap();
    assert_eq!(config.get("a"), Some(&Value::Int(1)));
    assert_eq!(config.get("b"), Some(&Value::Bool(true)));
    assert_eq!(config.get("x.c"), Some(&Value::Int(2)));
    assert_eq!(config.get("c"), None);
}

#[test]
fn dotted_lookup_splits_at_last_dot_and_misses_return_none() {
    let config = parse("[server.http]\nport = 80\n", &no_env(), &[]).unwrap();
    assert_eq!(config.get("server.http.port"), Some(&Value::Int(80)));
    assert_eq!(config.get("server.port"), None);
    let config2 = parse("[a]\nk = 1\n", &no_env(), &[]).unwrap();
    assert_eq!(config2.get("a.missing"), None);
    assert_eq!(config2.get("b.k"), None);
    assert_eq!(config2.get("k"), None);
}

#[test]
fn blank_and_comment_lines_are_ignored() {
    let text = "; semicolon comment\n# hash comment\n\n   \n    # indented comment\n[s]\n; another\nk = 1\n";
    let config = parse(text, &no_env(), &[]).unwrap();
    assert_eq!(config.get("s.k"), Some(&Value::Int(1)));
}

#[test]
fn whitespace_around_lines_keys_and_values_is_ignored() {
    let text = "   [sec]   \n\t key\t=\t  42  \r\nother=\"x\"\r\n";
    let config = parse(text, &no_env(), &[]).unwrap();
    assert_eq!(config.get("sec.key"), Some(&Value::Int(42)));
    assert_eq!(config.get("sec.other"), Some(&s("x")));
}

#[test]
fn integers_accept_sign_and_leading_zeros() {
    let text = "a = -17\nb = +5\nc = 007\nd = -9223372036854775808\ne = 9223372036854775807\n";
    let config = parse(text, &no_env(), &[]).unwrap();
    assert_eq!(config.get("a"), Some(&Value::Int(-17)));
    assert_eq!(config.get("b"), Some(&Value::Int(5)));
    assert_eq!(config.get("c"), Some(&Value::Int(7)));
    assert_eq!(config.get("d"), Some(&Value::Int(i64::MIN)));
    assert_eq!(config.get("e"), Some(&Value::Int(i64::MAX)));
}

#[test]
fn integer_out_of_range_is_bad_value() {
    let err = parse("a = 1\nb = 9223372036854775808\n", &no_env(), &[]).unwrap_err();
    assert_eq!(err, ConfigError::BadValue { line: 2 });
}

#[test]
fn booleans_are_lower_case_only() {
    let config = parse("a = true\nb = false\n", &no_env(), &[]).unwrap();
    assert_eq!(config.get("a"), Some(&Value::Bool(true)));
    assert_eq!(config.get("b"), Some(&Value::Bool(false)));
    let err = parse("a = True\n", &no_env(), &[]).unwrap_err();
    assert_eq!(err, ConfigError::BadValue { line: 1 });
}

#[test]
fn strings_decode_escapes_and_keep_inner_text() {
    let text = r#"v = "say \"hi\"\\ok\nnext\tend""#;
    let config = parse(text, &no_env(), &[]).unwrap();
    assert_eq!(config.get("v"), Some(&s("say \"hi\"\\ok\nnext\tend")));
    let config = parse("v = \"  a = b # c ; d  \"\nempty = \"\"\n", &no_env(), &[]).unwrap();
    assert_eq!(config.get("v"), Some(&s("  a = b # c ; d  ")));
    assert_eq!(config.get("empty"), Some(&s("")));
}

#[test]
fn unknown_escape_is_bad_escape() {
    let err = parse("a = 1\n\nb = \"x\\qy\"\n", &no_env(), &[]).unwrap_err();
    assert_eq!(err, ConfigError::BadEscape { line: 3 });
    let err = parse("k = [\"ok\", \"b\\ad\"]\n", &no_env(), &[]).unwrap_err();
    assert_eq!(err, ConfigError::BadEscape { line: 1 });
}

#[test]
fn unterminated_or_trailing_text_strings_are_bad_value() {
    let err = parse("a = \"abc\n", &no_env(), &[]).unwrap_err();
    assert_eq!(err, ConfigError::BadValue { line: 1 });
    let err = parse("a = \"abc\\\"\n", &no_env(), &[]).unwrap_err();
    assert_eq!(err, ConfigError::BadValue { line: 1 });
    let err = parse("a = \"abc\" x\n", &no_env(), &[]).unwrap_err();
    assert_eq!(err, ConfigError::BadValue { line: 1 });
}

#[test]
fn unrecognised_or_empty_values_are_bad_value() {
    for value in ["hello", "1.5", "5 # comment", "12abc", "-", "'single'"] {
        let text = format!("[s]\nk = {}\n", value);
        let err = parse(&text, &no_env(), &[]).unwrap_err();
        assert_eq!(err, ConfigError::BadValue { line: 2 }, "value {:?}", value);
    }
    let err = parse("k =   \n", &no_env(), &[]).unwrap_err();
    assert_eq!(err, ConfigError::BadValue { line: 1 });
}

#[test]
fn list_holds_mixed_scalars_and_respects_quoted_commas() {
    let text = r#"l = [ 1 , -2,true, "a,b", "]", "q\"," ]"#;
    let config = parse(text, &no_env(), &[]).unwrap();
    assert_eq!(
        config.get("l"),
        Some(&Value::List(vec![
            Value::Int(1),
            Value::Int(-2),
            Value::Bool(true),
            s("a,b"),
            s("]"),
            s("q\","),
        ]))
    );
}

#[test]
fn empty_list_is_allowed() {
    let config = parse("a = []\nb = [   ]\n", &no_env(), &[]).unwrap();
    assert_eq!(config.get("a"), Some(&Value::List(vec![])));
    assert_eq!(config.get("b"), Some(&Value::List(vec![])));
}

#[test]
fn malformed_lists_are_bad_value() {
    for value in ["[1, [2]]", "[[1]]", "[1,,2]", "[1,]", "[,]", "[1, 2", "[1, x]"] {
        let text = format!("k = {}\n", value);
        let err = parse(&text, &no_env(), &[]).unwrap_err();
        assert_eq!(err, ConfigError::BadValue { line: 1 }, "value {:?}", value);
    }
}

#[test]
fn line_without_equals_is_syntax_error() {
    let err = parse("# c\n\n[s]\njust some words\n", &no_env(), &[]).unwrap_err();
    assert_eq!(err, ConfigError::Syntax { line: 4 });
}

#[test]
fn invalid_keys_are_syntax_errors() {
    for line in ["my-key = 1", "= 1", "my key = 1", "k.x = 1"] {
        let err = parse(line, &no_env(), &[]).unwrap_err();
        assert_eq!(err, ConfigError::Syntax { line: 1 }, "line {:?}", line);
    }
}

#[test]
fn invalid_section_headers_are_syntax_errors() {
    for header in ["[]", "[my section]", "[ db ]", "[db] x", "[db", "[a-b]"] {
        let text = format!("a = 1\n{}\nb = 2\n", header);
        let err = parse(&text, &no_env(), &[]).unwrap_err();
        assert_eq!(err, ConfigError::Syntax { line: 2 }, "header {:?}", header);
    }
}

#[test]
fn repeated_section_headers_merge() {
    let text = "[a]\nx = 1\n[b]\ny = 2\n[a]\nz = 3\n";
    let config = parse(text, &no_env(), &[]).unwrap();
    assert_eq!(config.get("a.x"), Some(&Value::Int(1)));
    assert_eq!(config.get("a.z"), Some(&Value::Int(3)));
    assert_eq!(config.get("b.y"), Some(&Value::Int(2)));
}

#[test]
fn duplicate_key_across_repeated_section_is_an_error() {
    let text = "[a]\nx = 1\n[b]\nx = 2\n[a]\nx = 3\n";
    let err = parse(text, &no_env(), &[]).unwrap_err();
    assert_eq!(err, ConfigError::DuplicateKey { line: 6, key: "x".to_string() });
}

#[test]
fn keys_are_case_sensitive() {
    let config = parse("Port = 1\nport = 2\n", &no_env(), &[]).unwrap();
    assert_eq!(config.get("Port"), Some(&Value::Int(1)));
    assert_eq!(config.get("port"), Some(&Value::Int(2)));
}

#[test]
fn value_error_is_reported_before_duplicate_key() {
    let err = parse("k = 1\nk = nope\n", &no_env(), &[]).unwrap_err();
    assert_eq!(err, ConfigError::BadValue { line: 2 });
}

#[test]
fn first_error_in_the_text_wins() {
    let err = parse("a = bad\nno equals here\n", &no_env(), &[]).unwrap_err();
    assert_eq!(err, ConfigError::BadValue { line: 1 });
}

#[test]
fn env_overrides_root_and_dotted_section_keys_with_any_value_type() {
    let e = env(&[
        ("APP_NAME", "  \"prod\"  "),
        ("APP_SERVER_HTTP_HOSTS", "[\"a\", \"b\"]"),
        ("APP_SERVER_HTTP_TLS", "false"),
    ]);
    let text = "name = \"dev\"\n[server.http]\nhosts = []\ntls = true\n";
    let config = parse(text, &e, &[]).unwrap();
    assert_eq!(config.get("name"), Some(&s("prod")));
    assert_eq!(config.get("server.http.hosts"), Some(&Value::List(vec![s("a"), s("b")])));
    assert_eq!(config.get("server.http.tls"), Some(&Value::Bool(false)));
}

#[test]
fn env_name_upper_cases_mixed_case_keys_and_is_case_sensitive() {
    let e = env(&[("APP_DB_MAXCONN", "50"), ("app_db_timeout", "9")]);
    let config = parse("[db]\nmaxConn = 10\ntimeout = 3\n", &e, &[]).unwrap();
    assert_eq!(config.get("db.maxConn"), Some(&Value::Int(50)));
    assert_eq!(config.get("db.timeout"), Some(&Value::Int(3)));
}

#[test]
fn env_overrides_every_key_sharing_the_env_name() {
    let e = env(&[("APP_DB_HOST", "\"h\"")]);
    let config = parse("db_host = 1\n[db]\nhost = 2\n", &e, &[]).unwrap();
    assert_eq!(config.get("db_host"), Some(&s("h")));
    assert_eq!(config.get("db.host"), Some(&s("h")));
}

#[test]
fn unmatched_env_entries_are_ignored_and_add_nothing() {
    let e = env(&[("APP_DB_PORT", "not a value"), ("HOME", "/root"), ("APP_NEW", "1")]);
    let config = parse("[db]\nhost = \"x\"\n", &e, &[]).unwrap();
    assert_eq!(config.get("db.host"), Some(&s("x")));
    assert_eq!(config.get("db.port"), None);
    assert_eq!(config.get("new"), None);
}

#[test]
fn unparsable_env_value_is_bad_env_with_entry_name() {
    let e = env(&[("APP_DB_PORT", "eighty")]);
    let err = parse("[db]\nport = 80\n", &e, &[]).unwrap_err();
    assert_eq!(err, ConfigError::BadEnv("APP_DB_PORT".to_string()));
    let e = env(&[("APP_DB_PORT", "\"\\x\"")]);
    let err = parse("[db]\nport = 80\n", &e, &[]).unwrap_err();
    assert_eq!(err, ConfigError::BadEnv("APP_DB_PORT".to_string()));
}

#[test]
fn first_bad_env_entry_in_name_order_is_reported() {
    let e = env(&[("APP_B", "bad"), ("APP_A", "bad")]);
    let err = parse("a = 1\nb = 2\n", &e, &[]).unwrap_err();
    assert_eq!(err, ConfigError::BadEnv("APP_A".to_string()));
}

#[test]
fn text_errors_are_reported_before_env_errors() {
    let e = env(&[("APP_A", "bad")]);
    let err = parse("a = 1\nb = bad\n", &e, &[]).unwrap_err();
    assert_eq!(err, ConfigError::BadValue { line: 2 });
}

#[test]
fn first_missing_required_name_is_reported_and_present_names_pass() {
    let text = "name = 1\n[db.main]\nhost = 2\n";
    let err = parse(text, &no_env(), &["name", "db.main.port", "zzz", "db.main.host"]).unwrap_err();
    assert_eq!(err, ConfigError::MissingRequired("db.main.port".to_string()));
    let err = parse(text, &no_env(), &["db.host"]).unwrap_err();
    assert_eq!(err, ConfigError::MissingRequired("db.host".to_string()));
    let config = parse(text, &no_env(), &["db.main.host", "name"]).unwrap();
    assert_eq!(config.get("db.main.host"), Some(&Value::Int(2)));
}

