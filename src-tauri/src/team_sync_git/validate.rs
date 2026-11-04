//! Pure helpers for the Git-backed team workspace sync: input validation and
//! output parsing. Nothing in here touches the file system beyond `Path` checks
//! or spawns a process, so everything is directly unit-testable.

use std::path::{Path, PathBuf};

/// The only file this feature ever reads or writes inside the repository.
pub const BUNDLE_FILE_NAME: &str = "tabularis-workspace.json";

/// Upper bound for a bundle accepted from the UI or read back from the repository.
pub const MAX_BUNDLE_BYTES: usize = 50 * 1024 * 1024;

const MAX_COMMIT_MESSAGE_CHARS: usize = 200;

/// Validates the repository directory chosen by the user and returns its canonical path.
///
/// The directory must exist, be absolute and contain a `.git` entry (a directory, or a
/// file for worktrees and submodules). This keeps the feature from running `git`
/// somewhere the user did not point it at.
pub fn validate_repo_dir(raw: &str) -> Result<PathBuf, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("Repository path is empty".into());
    }
    if trimmed.contains('\0') {
        return Err("Repository path contains an invalid character".into());
    }
    let path = Path::new(trimmed);
    if !path.is_absolute() {
        return Err("Repository path must be absolute".into());
    }
    let canonical = path
        .canonicalize()
        .map_err(|e| format!("Repository folder is not accessible: {e}"))?;
    if !canonical.is_dir() {
        return Err("Repository path is not a folder".into());
    }
    if !canonical.join(".git").exists() {
        return Err("The selected folder is not a Git repository (no .git found)".into());
    }
    Ok(canonical)
}

/// Normalizes a commit message: trimmed, non-empty, bounded, no NUL bytes.
pub fn sanitize_commit_message(raw: &str) -> Result<String, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("Commit message is empty".into());
    }
    if trimmed.contains('\0') {
        return Err("Commit message contains an invalid character".into());
    }
    if trimmed.chars().count() > MAX_COMMIT_MESSAGE_CHARS {
        return Err(format!(
            "Commit message is too long (max {MAX_COMMIT_MESSAGE_CHARS} characters)"
        ));
    }
    Ok(trimmed.to_string())
}

/// Rejects bundles that are empty, oversized or not a JSON object before they touch disk.
pub fn validate_bundle_content(content: &str) -> Result<(), String> {
    if content.trim().is_empty() {
        return Err("Bundle content is empty".into());
    }
    if content.len() > MAX_BUNDLE_BYTES {
        return Err(format!(
            "Bundle is too large (max {} MB)",
            MAX_BUNDLE_BYTES / 1024 / 1024
        ));
    }
    match serde_json::from_str::<serde_json::Value>(content) {
        Ok(serde_json::Value::Object(_)) => Ok(()),
        Ok(_) => Err("Bundle must be a JSON object".into()),
        Err(e) => Err(format!("Bundle is not valid JSON: {e}")),
    }
}

/// Parses `git rev-list --left-right --count @{u}...HEAD` output ("<behind>\t<ahead>")
/// into `(ahead, behind)`.
pub fn parse_ahead_behind(output: &str) -> Option<(u32, u32)> {
    let mut parts = output.split_whitespace();
    let behind = parts.next()?.parse::<u32>().ok()?;
    let ahead = parts.next()?.parse::<u32>().ok()?;
    if parts.next().is_some() {
        return None;
    }
    Some((ahead, behind))
}

/// Removes credentials embedded in URLs (`https://user:token@host/...`) from text that
/// may be shown in the UI or written to logs.
pub fn redact_credentials(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(scheme_end) = rest.find("://") {
        let (head, tail) = rest.split_at(scheme_end + 3);
        out.push_str(head);
        let authority_end = tail
            .find(|c: char| c == '/' || c.is_whitespace())
            .unwrap_or(tail.len());
        let authority = &tail[..authority_end];
        match authority.rfind('@') {
            Some(at) => out.push_str(&authority[at + 1..]),
            None => out.push_str(authority),
        }
        rest = &tail[authority_end..];
    }
    out.push_str(rest);
    out
}
