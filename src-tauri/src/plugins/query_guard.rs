//! Read-only gate for queries sent by plugin UI code.
//!
//! `usePluginQuery` is documented as read-only, but it used to call `execute_query`, which runs anything: a
//! plugin (or a bug in one) could `DELETE`, `DROP`, or `UPDATE` without the confirmations the editor shows.
//! Plugin queries now go through `execute_plugin_query`, which calls [`ensure_read_only`] first.
//!
//! Limits, stated plainly: this is a safety rail for plugins that follow the API, not a security boundary.
//! Plugin UI code runs inside the main webview and can still call any Tauri command directly; isolating it is
//! a separate project (see `plugins/SANDBOX_DESIGN.md`). A read-only statement can also call a database
//! function with side effects, so the best-known ones are refused below, but the list cannot be complete.

use crate::ai_activity::{classify_query_kind, strip_strings_and_comments};

/// SQLite pragmas that only report information. Every other `PRAGMA` can change settings.
const READ_ONLY_PRAGMAS: &[&str] = &[
    "TABLE_INFO",
    "TABLE_XINFO",
    "TABLE_LIST",
    "INDEX_LIST",
    "INDEX_INFO",
    "INDEX_XINFO",
    "FOREIGN_KEY_LIST",
    "DATABASE_LIST",
    "COLLATION_LIST",
];

/// Keywords that turn an otherwise read-looking statement into one that writes or locks:
/// `SELECT ... INTO new_table` (PostgreSQL), `INTO OUTFILE` (MySQL), `FOR UPDATE`, `LOCK IN SHARE MODE`.
const WRITING_KEYWORDS: &[&str] = &["INTO", "UPDATE", "LOCK"];

/// Functions that change state or touch the server's files and sessions even inside a `SELECT`.
const SIDE_EFFECT_FUNCTIONS: &[&str] = &[
    "NEXTVAL",
    "SETVAL",
    "SET_CONFIG",
    "PG_TERMINATE_BACKEND",
    "PG_CANCEL_BACKEND",
    "PG_RELOAD_CONF",
    "PG_ROTATE_LOGFILE",
    "PG_ADVISORY_LOCK",
    "PG_ADVISORY_XACT_LOCK",
    "LO_IMPORT",
    "LO_EXPORT",
    "LO_UNLINK",
    "PG_READ_FILE",
    "PG_READ_BINARY_FILE",
    "PG_LS_DIR",
    "DBLINK_EXEC",
    "DBLINK",
    "LOAD_FILE",
    "GET_LOCK",
    "RELEASE_LOCK",
    "SLEEP",
    "BENCHMARK",
    "LOAD_EXTENSION",
];

const REFUSAL_PREFIX: &str = "Plugins can only run read-only queries (SELECT, WITH, SHOW, DESCRIBE, EXPLAIN, VALUES)";

fn refuse(reason: &str) -> String {
    format!("{REFUSAL_PREFIX}: {reason}")
}

/// Uppercase identifier-like words of the statement with strings, comments and quoted identifiers removed.
fn words_of(sql: &str) -> Vec<String> {
    strip_strings_and_comments(sql)
        .to_ascii_uppercase()
        .split(|c: char| !(c.is_ascii_alphanumeric() || c == '_'))
        .filter(|w| !w.is_empty())
        .map(str::to_string)
        .collect()
}

/// Accepts a single read-only statement, otherwise explains why it was refused.
pub fn ensure_read_only(sql: &str) -> Result<(), String> {
    // Fail-closed classifier shared with the MCP read-only mode: rejects writes, DDL, unknown statements and
    // anything with a second statement after a `;`.
    if classify_query_kind(sql) != "select" {
        return Err(refuse("this statement is not a single read-only statement"));
    }

    let words = words_of(sql);
    let Some(first) = words.first() else {
        return Err(refuse("the statement is empty"));
    };

    match first.as_str() {
        "EXPLAIN" if words.iter().any(|w| w == "ANALYZE" || w == "ANALYSE") => {
            // EXPLAIN ANALYZE executes the statement it explains.
            return Err(refuse("EXPLAIN ANALYZE runs the statement"));
        }
        "PRAGMA" => {
            let stripped = strip_strings_and_comments(sql);
            let reads_only = !stripped.contains('=')
                && words.iter().skip(1).take(2).any(|w| READ_ONLY_PRAGMAS.contains(&w.as_str()));
            if !reads_only {
                return Err(refuse("only informational PRAGMA statements are allowed"));
            }
        }
        _ => {}
    }

    if let Some(word) = words.iter().find(|w| WRITING_KEYWORDS.contains(&w.as_str())) {
        return Err(refuse(&format!("{word} is not allowed")));
    }
    if let Some(word) = words.iter().find(|w| SIDE_EFFECT_FUNCTIONS.contains(&w.as_str())) {
        return Err(refuse(&format!("the function {word} has side effects")));
    }
    Ok(())
}

#[cfg(test)]
mod tests;
