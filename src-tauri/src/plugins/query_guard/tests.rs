use super::ensure_read_only;

fn refused(sql: &str) -> String {
    ensure_read_only(sql).expect_err(&format!("should be refused: {sql}"))
}

#[test]
fn plain_reads_are_accepted() {
    for sql in [
        "SELECT 1",
        "select * from users where name = 'a;b'",
        "SELECT * FROM t; ",
        "  -- comment\n SELECT id FROM t",
        "WITH x AS (SELECT 1) SELECT * FROM x",
        "(SELECT 1) UNION ALL (SELECT 2)",
        "SHOW TABLES",
        "DESCRIBE users",
        "EXPLAIN SELECT * FROM t",
        "VALUES (1), (2)",
        "SELECT 'DELETE FROM users' AS note",
        "SELECT \"update\" FROM t",
    ] {
        assert!(ensure_read_only(sql).is_ok(), "should be accepted: {sql}");
    }
}

#[test]
fn writes_and_ddl_are_refused() {
    for sql in [
        "INSERT INTO t VALUES (1)",
        "UPDATE t SET a = 1",
        "DELETE FROM t",
        "DROP TABLE t",
        "TRUNCATE t",
        "ALTER TABLE t ADD c int",
        "CREATE TABLE x (a int)",
        "GRANT ALL ON t TO u",
        "MERGE INTO t USING s ON 1=1 WHEN MATCHED THEN DELETE",
    ] {
        refused(sql);
    }
}

#[test]
fn a_second_statement_is_refused_in_both_quoting_dialects() {
    refused("SELECT 1; DROP TABLE users");
    refused("SELECT 1;DELETE FROM users");
    refused("SELECT '\\''; DROP TABLE users");
    refused("SELECT 1 /* x */; /* y */ DROP TABLE users");
}

#[test]
fn writable_ctes_are_refused() {
    refused("WITH d AS (DELETE FROM t RETURNING *) SELECT * FROM d");
    refused("WITH i AS (INSERT INTO t VALUES (1) RETURNING *) SELECT * FROM i");
}

#[test]
fn selects_that_write_or_lock_are_refused() {
    assert!(refused("SELECT * INTO backup_users FROM users").contains("INTO"));
    refused("SELECT * FROM users INTO OUTFILE '/tmp/x'");
    refused("SELECT * FROM t FOR UPDATE");
    refused("SELECT * FROM t LOCK IN SHARE MODE");
}

#[test]
fn explain_analyze_is_refused_because_it_executes_the_statement() {
    assert!(refused("EXPLAIN ANALYZE DELETE FROM t").contains("EXPLAIN ANALYZE"));
    refused("EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM t");
    refused("EXPLAIN ANALYSE SELECT 1");
}

#[test]
fn only_informational_pragmas_are_accepted() {
    assert!(ensure_read_only("PRAGMA table_info(users)").is_ok());
    assert!(ensure_read_only("PRAGMA main.index_list('users')").is_ok());
    assert!(ensure_read_only("pragma foreign_key_list(orders)").is_ok());
    refused("PRAGMA foreign_keys = OFF");
    refused("PRAGMA writable_schema = 1");
    refused("PRAGMA user_version = 5");
    refused("PRAGMA journal_mode");
    refused("PRAGMA table_info(t) ; PRAGMA writable_schema = 1");
}

#[test]
fn functions_with_side_effects_are_refused() {
    for sql in [
        "SELECT nextval('seq')",
        "SELECT setval('seq', 1)",
        "SELECT pg_terminate_backend(123)",
        "SELECT set_config('x', 'y', false)",
        "SELECT lo_import('/etc/passwd')",
        "SELECT pg_read_file('/etc/passwd')",
        "SELECT SLEEP(100)",
        "SELECT LOAD_FILE('/etc/passwd')",
        "SELECT load_extension('x')",
    ] {
        refused(sql);
    }
}

#[test]
fn keywords_inside_strings_comments_and_quoted_names_do_not_trigger() {
    assert!(ensure_read_only("SELECT 'INTO UPDATE LOCK sleep(1)' FROM t").is_ok());
    assert!(ensure_read_only("SELECT a FROM t -- FOR UPDATE").is_ok());
    assert!(ensure_read_only("SELECT a FROM t /* INTO x */").is_ok());
    assert!(ensure_read_only("SELECT \"into\", `lock` FROM t").is_ok());
}

#[test]
fn empty_or_garbage_input_is_refused() {
    refused("");
    refused("   ");
    refused(";");
    refused("what is this");
}

#[test]
fn the_refusal_tells_the_plugin_author_what_is_allowed() {
    let msg = refused("DELETE FROM t");
    assert!(msg.starts_with("Plugins can only run read-only queries"), "{msg}");
}
