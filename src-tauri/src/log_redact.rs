//! Makes database error text safe to write to the log.
//!
//! The user sees the full error in the UI, but the log can be exported or shared, and database errors quote
//! data: PostgreSQL `Detail: Key (email)=(a@b.com) already exists.`, MySQL `Duplicate entry 'a@b.com' for key`,
//! `invalid input syntax for type integer: "abc"`. [`redact_db_error`] keeps what helps diagnosis (the kind of
//! error, table / column / constraint names) and removes values and everything that can echo the query.

/// Longest error text written to the log.
const MAX_LOGGED_ERROR_CHARS: usize = 300;

/// Shown in place of a removed value.
const REDACTED: &str = "<redacted>";

/// A quoted segment is an identifier, and therefore kept, when the word right before it is one of these
/// (`column "x"`, `for key 'users.email'`, `Table 'db.t' doesn't exist`). Anything else may be a value.
const IDENTIFIER_WORDS: &[&str] = &[
    "column", "columns", "table", "relation", "constraint", "schema", "index", "key", "type", "function",
    "database", "role", "user", "sequence", "view", "trigger", "extension", "language", "procedure",
    "routine", "collation", "domain", "operator", "tablespace", "publication", "subscription",
];

/// Lines of a PostgreSQL error report that quote data or SQL text.
const SENSITIVE_LINE_PREFIXES: &[&str] = &["detail:", "hint:", "where:", "context:", "statement:", "query:"];

/// Log-safe form of a database error: detail lines dropped, quoted values replaced by `<redacted>`,
/// internal-query text removed, one line, length-limited.
pub fn redact_db_error(message: &str) -> String {
    let kept: Vec<String> = message
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .filter(|line| {
            let lower = line.to_ascii_lowercase();
            !SENSITIVE_LINE_PREFIXES.iter().any(|p| lower.starts_with(p))
        })
        .map(strip_internal_query)
        .map(|line| redact_quoted_values(&line))
        .collect();
    let joined = kept.join(" | ");
    truncate(&joined)
}

/// `Position: character 5 in internal query: SELECT ...` keeps only the position.
fn strip_internal_query(line: &str) -> String {
    match line.find("in internal query:") {
        Some(at) => format!("{}in internal query", &line[..at]),
        None => line.to_string(),
    }
}

/// Replaces `'...'` and `"..."` segments with `<redacted>` unless they follow an identifier word.
fn redact_quoted_values(line: &str) -> String {
    let chars: Vec<char> = line.chars().collect();
    let mut out = String::with_capacity(line.len());
    let mut i = 0;
    while i < chars.len() {
        let quote = chars[i];
        if quote != '\'' && quote != '"' {
            out.push(quote);
            i += 1;
            continue;
        }
        // Find the closing quote; a doubled quote inside is an escaped quote. A lone quote that never closes
        // (an apostrophe like in "doesn't") is kept as text.
        let mut j = i + 1;
        let mut closed = false;
        while j < chars.len() {
            if chars[j] == quote {
                if chars.get(j + 1) == Some(&quote) {
                    j += 2;
                    continue;
                }
                closed = true;
                break;
            }
            j += 1;
        }
        if !closed || is_contraction(&chars, i) {
            out.push(quote);
            i += 1;
            continue;
        }
        let inner: String = chars[i + 1..j].iter().collect();
        if follows_identifier_word(&out) {
            out.push(quote);
            out.push_str(&inner);
            out.push(quote);
        } else {
            out.push(quote);
            out.push_str(REDACTED);
            out.push(quote);
        }
        i = j + 1;
    }
    out
}

/// `doesn't`, `can't`: an apostrophe between two letters is not a quote.
fn is_contraction(chars: &[char], at: usize) -> bool {
    chars[at] == '\''
        && at > 0
        && chars[at - 1].is_alphabetic()
        && chars.get(at + 1).is_some_and(|c| c.is_alphabetic())
        && chars[at + 1..].iter().take_while(|c| c.is_alphabetic()).count() <= 2
}

/// True when the word before the quote is an identifier word. A quote right after `word:` introduces a
/// value (`for type integer: "abc"`), never an object name.
fn follows_identifier_word(text_before: &str) -> bool {
    let trimmed = text_before.trim_end();
    if trimmed.ends_with(':') {
        return false;
    }
    let word: String = trimmed
        .chars()
        .rev()
        .take_while(|c| c.is_alphabetic())
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect();
    !word.is_empty() && IDENTIFIER_WORDS.contains(&word.to_ascii_lowercase().as_str())
}

fn truncate(text: &str) -> String {
    let total = text.chars().count();
    if total <= MAX_LOGGED_ERROR_CHARS {
        return text.to_string();
    }
    let head: String = text.chars().take(MAX_LOGGED_ERROR_CHARS).collect();
    format!("{head}… ({total} chars)")
}

#[cfg(test)]
mod tests;
