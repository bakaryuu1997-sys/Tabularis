//! Files the user picked in a native dialog, remembered so the backend can tell them apart from paths a
//! script in the webview made up.
//!
//! Commands that read a file for a BLOB upload (`read_file_as_data_url`, and the `BLOB_FILE_REF:` values the
//! drivers resolve on INSERT/UPDATE) must not open arbitrary paths: otherwise a page could ask for
//! `~/.ssh/id_rsa`, have it written into a table cell and read it back. Only a path that went through
//! [`approve`] (called right after the dialog returns) is readable.

use std::collections::VecDeque;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, PoisonError};

/// A user picks a handful of files per session; the cap only bounds memory if a page spams the picker.
const MAX_APPROVED: usize = 256;

static APPROVED: Mutex<VecDeque<PathBuf>> = Mutex::new(VecDeque::new());

fn canonical(path: &Path) -> Result<PathBuf, String> {
    path.canonicalize()
        .map_err(|e| format!("Failed to open file: {}", e))
}

/// Remembers a dialog-picked file and returns its canonical path.
pub fn approve(path: &Path) -> Result<PathBuf, String> {
    let canonical = canonical(path)?;
    let mut approved = APPROVED.lock().unwrap_or_else(PoisonError::into_inner);
    if !approved.contains(&canonical) {
        if approved.len() >= MAX_APPROVED {
            approved.pop_front();
        }
        approved.push_back(canonical.clone());
    }
    Ok(canonical)
}

/// Returns the canonical path when `path` is a file the user approved, otherwise an error.
///
/// The path is canonicalized again here, so a file swapped for a symlink to somewhere else after approval no
/// longer matches.
pub fn require_approved(path: &str) -> Result<PathBuf, String> {
    const DENIED: &str = "This file was not selected through the file dialog";
    let canonical = Path::new(path).canonicalize().map_err(|_| DENIED.to_string())?;
    let approved = APPROVED.lock().unwrap_or_else(PoisonError::into_inner);
    if approved.contains(&canonical) {
        Ok(canonical)
    } else {
        Err(DENIED.into())
    }
}

#[cfg(test)]
mod tests;
