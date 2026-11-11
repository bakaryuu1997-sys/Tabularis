//! Export destinations chosen in the native "Save as" dialog.
//!
//! `export_query_to_file` used to receive the destination path from the webview, so a script in the page could
//! make it write to any file. The dialog now runs in Rust, the chosen path stays here, and the webview only
//! gets an opaque one-time token to hand back.

use std::collections::VecDeque;
use std::path::PathBuf;
use std::sync::{Mutex, PoisonError};

/// A user picks a handful of destinations at a time; the cap only bounds memory if a page spams the dialog.
const MAX_PENDING: usize = 16;

#[derive(Default)]
pub struct ExportDestinationState {
    entries: Mutex<VecDeque<(String, PathBuf)>>,
}

impl ExportDestinationState {
    /// Remembers a chosen path and returns its token.
    pub fn register(&self, path: PathBuf) -> String {
        let token = uuid::Uuid::new_v4().to_string();
        let mut entries = self.entries.lock().unwrap_or_else(PoisonError::into_inner);
        if entries.len() >= MAX_PENDING {
            entries.pop_front();
        }
        entries.push_back((token.clone(), path));
        token
    }

    /// Returns the path for a token and forgets it, so a token works once.
    pub fn take(&self, token: &str) -> Option<PathBuf> {
        let mut entries = self.entries.lock().unwrap_or_else(PoisonError::into_inner);
        let index = entries.iter().position(|(t, _)| t == token)?;
        entries.remove(index).map(|(_, path)| path)
    }
}

#[cfg(test)]
mod tests;
