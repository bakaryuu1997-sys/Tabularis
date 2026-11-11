//! Referential actions (`ON DELETE` / `ON UPDATE`) accepted when generating foreign key DDL.

/// Maps a user-supplied action to its canonical SQL keyword, or rejects it.
///
/// The text comes from the frontend and is spliced into a DDL statement, so only the five standard
/// referential actions are accepted (case-insensitive, extra spaces tolerated). Anything else, such as
/// `CASCADE; DROP TABLE users`, is an error instead of being appended to the statement.
pub fn normalize_fk_action(action: &str) -> Result<&'static str, String> {
    let words: Vec<String> = action
        .split_whitespace()
        .map(|w| w.to_ascii_uppercase())
        .collect();
    match words.iter().map(String::as_str).collect::<Vec<_>>().as_slice() {
        ["NO", "ACTION"] => Ok("NO ACTION"),
        ["RESTRICT"] => Ok("RESTRICT"),
        ["CASCADE"] => Ok("CASCADE"),
        ["SET", "NULL"] => Ok("SET NULL"),
        ["SET", "DEFAULT"] => Ok("SET DEFAULT"),
        _ => Err(format!("Unsupported foreign key action: {action:?}")),
    }
}
