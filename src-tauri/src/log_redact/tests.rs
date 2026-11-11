use super::redact_db_error;

#[test]
fn postgres_unique_violation_loses_the_key_value_but_keeps_the_constraint() {
    let msg = "ERROR: duplicate key value violates unique constraint \"users_email_key\"\n\nDetail: Key (email)=(alice@example.com) already exists.\nTable: table \"users\"";
    let out = redact_db_error(msg);
    assert!(out.contains("duplicate key value violates unique constraint \"users_email_key\""), "{out}");
    assert!(!out.contains("alice@example.com"), "{out}");
    assert!(!out.to_lowercase().contains("detail"), "{out}");
    assert!(!out.contains('\n'), "{out}");
}

#[test]
fn postgres_hint_where_and_context_lines_are_dropped() {
    let msg = "ERROR: boom\nHint: try 'secret-hint'\nWhere: PL/pgSQL function f() line 3 at RAISE\nContext: value 'x'";
    assert_eq!(redact_db_error(msg), "ERROR: boom");
}

#[test]
fn postgres_value_in_message_is_redacted() {
    let out = redact_db_error("ERROR: invalid input syntax for type integer: \"123-45-6789\"");
    assert_eq!(out, "ERROR: invalid input syntax for type integer: \"<redacted>\"");
    let out = redact_db_error("ERROR: value \"99999\" is out of range for type smallint");
    assert!(!out.contains("99999"), "{out}");
    assert!(out.contains("smallint"), "{out}");
}

#[test]
fn postgres_object_names_are_kept() {
    let msg = "ERROR: null value in column \"email\" of relation \"users\" violates not-null constraint";
    assert_eq!(redact_db_error(msg), msg);
    let msg = "ERROR: relation \"orders\" does not exist";
    assert_eq!(redact_db_error(msg), msg);
}

#[test]
fn postgres_internal_query_text_is_removed() {
    let out = redact_db_error("ERROR: bad\nPosition: character 7 in internal query: SELECT ssn FROM people");
    assert!(!out.contains("SELECT ssn"), "{out}");
    assert!(out.contains("character 7"), "{out}");
}

#[test]
fn mysql_duplicate_entry_value_is_redacted_but_the_key_is_kept() {
    let out = redact_db_error("error returned from database: 1062 (23000): Duplicate entry 'bob@example.com' for key 'users.email'");
    assert_eq!(
        out,
        "error returned from database: 1062 (23000): Duplicate entry '<redacted>' for key 'users.email'"
    );
}

#[test]
fn mysql_bad_value_is_redacted_but_the_column_is_kept() {
    let out = redact_db_error("Incorrect integer value: 'abc-secret' for column 'age' at row 1");
    assert!(!out.contains("abc-secret"), "{out}");
    assert!(out.contains("for column 'age'"), "{out}");
}

#[test]
fn mysql_missing_table_keeps_its_name_and_apostrophes_in_words_survive() {
    let out = redact_db_error("Table 'shop.orders' doesn't exist");
    assert_eq!(out, "Table 'shop.orders' doesn't exist");
}

#[test]
fn escaped_quotes_inside_a_value_do_not_leak_the_rest() {
    let out = redact_db_error("Duplicate entry 'o''brien@x.com' for key 'users.email'");
    assert!(!out.contains("brien"), "{out}");
    assert!(out.contains("for key 'users.email'"), "{out}");
}

#[test]
fn unclosed_quotes_do_not_panic_or_hide_the_message() {
    assert_eq!(redact_db_error("unterminated 'string"), "unterminated 'string");
    assert_eq!(redact_db_error(""), "");
    assert_eq!(redact_db_error("\n\n"), "");
}

#[test]
fn sqlite_messages_pass_through() {
    assert_eq!(redact_db_error("UNIQUE constraint failed: users.email"), "UNIQUE constraint failed: users.email");
    assert_eq!(redact_db_error("no such column: age"), "no such column: age");
}

#[test]
fn syntax_error_tokens_are_redacted() {
    let out = redact_db_error("ERROR: syntax error at or near \"hunter2\"");
    assert!(!out.contains("hunter2"), "{out}");
}

#[test]
fn long_messages_are_cut_and_report_their_length() {
    let out = redact_db_error(&"x".repeat(1000));
    assert!(out.chars().count() < 330, "{}", out.chars().count());
    assert!(out.ends_with("(1000 chars)"), "{out}");
}

#[test]
fn non_ascii_text_is_handled_by_characters() {
    let out = redact_db_error("Duplicate entry 'Nguyễn Văn Á' for key 'users.name'");
    assert!(!out.contains("Nguy"), "{out}");
    assert_eq!(redact_db_error("lỗi cột 'tên'"), "lỗi cột '<redacted>'");
}
