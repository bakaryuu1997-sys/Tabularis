use super::{describe, summarize};

#[test]
fn a_query_request_shows_the_tool_but_not_the_sql() {
    let line = r#"{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"run_query","arguments":{"query":"SELECT * FROM customers WHERE email='a@b.com'"}}}"#;
    let text = summarize(line);
    assert!(text.contains("id=7"), "{text}");
    assert!(text.contains("method=tools/call"), "{text}");
    assert!(text.contains("tool=run_query"), "{text}");
    assert!(!text.contains("customers"), "{text}");
    assert!(!text.contains("a@b.com"), "{text}");
}

#[test]
fn a_result_response_hides_the_rows() {
    let line = r#"{"jsonrpc":"2.0","id":"abc","result":{"content":[{"type":"text","text":"[{\"ssn\":\"123-45-6789\"}]"}]}}"#;
    let text = summarize(line);
    assert!(text.contains("id=abc"), "{text}");
    assert!(text.ends_with("result"), "{text}");
    assert!(!text.contains("123-45-6789"), "{text}");
}

#[test]
fn an_error_response_keeps_only_the_code() {
    let line = r#"{"jsonrpc":"2.0","id":1,"error":{"code":-32000,"message":"syntax error near 'password123'"}}"#;
    let text = summarize(line);
    assert!(text.contains("error code=-32000"), "{text}");
    assert!(!text.contains("password123"), "{text}");
}

#[test]
fn invalid_json_is_reported_by_size_only() {
    let text = summarize("SELECT secret FROM t -- not json");
    assert!(text.contains("not valid JSON"), "{text}");
    assert!(!text.contains("secret"), "{text}");
}

#[test]
fn notifications_have_no_id() {
    let text = summarize(r#"{"jsonrpc":"2.0","method":"notifications/initialized"}"#);
    assert!(text.contains("method=notifications/initialized"), "{text}");
    assert!(!text.contains("id="), "{text}");
}

#[test]
fn hostile_method_names_are_shortened_and_cleaned() {
    let method = format!("x\n{}", "m".repeat(500));
    let line = serde_json::json!({"jsonrpc":"2.0","id":1,"method":method}).to_string();
    let text = summarize(&line);
    assert!(!text.contains('\n'));
    assert!(text.chars().count() < 160, "{}", text.chars().count());
    assert!(text.contains('…'));
}

#[test]
fn payloads_are_only_included_when_asked_for() {
    let line = r#"{"id":1,"method":"tools/call","params":{"name":"run_query","arguments":{"query":"SELECT 1"}}}"#;
    assert_eq!(describe(line, true), line);
    assert!(!describe(line, false).contains("SELECT 1"));
}
