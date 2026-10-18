use rustconfig::*;
use std::time::Duration;

#[test]
fn duration_and_defaults() {
    let env = Default::default();
    let c = parse_with_defaults(
        "a=[1s, 250ms]\n",
        &env,
        &["x.y"],
        &[("x.y", Value::Int(1)), ("a", Value::Int(2))],
    )
    .unwrap();
    assert_eq!(
        c.get("a"),
        Some(&Value::List(vec![
            Value::Duration(Duration::from_secs(1)),
            Value::Duration(Duration::from_millis(250))
        ]))
    );
    assert_eq!(c.get("x.y"), Some(&Value::Int(1)));
    for bad in ["5 s", "-5s", "+5s", "1.5h", "5S", "5d", "s", "ms", "18446744073709551616s", "18446744073709551615m"] {
        let text = format!("a={}", bad);
        assert!(parse(&text, &env, &[]).is_err(), "{}", bad);
    }
    assert!(parse("a=18446744073709551615s", &env, &[]).is_ok());
}
