//! Git-backed team workspace sync.
//!
//! The frontend builds a (optionally encrypted) workspace bundle; this module only
//! moves that single file in and out of a local Git repository the user picked and
//! runs `git` for pull / commit / push. Credentials are never handled here: `git`
//! uses the user's own configuration and credential helpers, and prompting is
//! disabled so a missing credential fails fast instead of hanging the app.

use std::path::Path;
use std::process::Stdio;
use std::time::Duration;

use serde::Serialize;
use tokio::io::AsyncWriteExt;
use tokio::process::Command;

mod validate;

#[cfg(test)]
mod tests;

pub use validate::BUNDLE_FILE_NAME;
use validate::{
    parse_ahead_behind, redact_credentials, sanitize_commit_message, validate_bundle_content,
    validate_repo_dir, MAX_BUNDLE_BYTES,
};

const GIT_TIMEOUT: Duration = Duration::from_secs(60);

#[derive(Debug, Serialize)]
pub struct GitRepoStatus {
    pub branch: Option<String>,
    pub remote_url: Option<String>,
    pub has_upstream: bool,
    pub ahead: u32,
    pub behind: u32,
    pub bundle_exists: bool,
    /// The bundle file has uncommitted changes (or is untracked).
    pub bundle_dirty: bool,
}

#[derive(Debug, Serialize)]
pub struct GitPublishResult {
    pub committed: bool,
    pub pushed: bool,
    /// Why nothing was pushed, when a push was requested but skipped.
    pub push_skipped_reason: Option<String>,
}

struct GitOutput {
    success: bool,
    stdout: String,
    stderr: String,
}

async fn run_git(repo: &Path, args: &[&str]) -> Result<GitOutput, String> {
    let mut command = Command::new("git");
    command
        .args(args)
        .current_dir(repo)
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GCM_INTERACTIVE", "never")
        .env("LC_ALL", "C")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);

    let child = command.spawn().map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            "Git is not installed or not on PATH".to_string()
        } else {
            format!("Failed to start git: {e}")
        }
    })?;

    let output = tokio::time::timeout(GIT_TIMEOUT, child.wait_with_output())
        .await
        .map_err(|_| format!("git {} timed out after {}s", args.first().unwrap_or(&""), GIT_TIMEOUT.as_secs()))?
        .map_err(|e| format!("git failed: {e}"))?;

    Ok(GitOutput {
        success: output.status.success(),
        stdout: String::from_utf8_lossy(&output.stdout).trim().to_string(),
        stderr: redact_credentials(String::from_utf8_lossy(&output.stderr).trim()),
    })
}

fn git_error(action: &str, out: &GitOutput) -> String {
    let detail = if out.stderr.is_empty() { &out.stdout } else { &out.stderr };
    format!("git {action} failed: {detail}")
}

fn bundle_path(repo: &Path) -> std::path::PathBuf {
    repo.join(BUNDLE_FILE_NAME)
}

#[tauri::command]
pub async fn team_git_status(repo_path: String) -> Result<GitRepoStatus, String> {
    let repo = validate_repo_dir(&repo_path)?;

    // `symbolic-ref` also works in a fresh repository without commits; it fails on a detached HEAD.
    let branch_out = run_git(&repo, &["symbolic-ref", "--short", "HEAD"]).await?;
    let branch = branch_out.success.then_some(branch_out.stdout).filter(|s| !s.is_empty());

    let remote = run_git(&repo, &["remote", "get-url", "origin"]).await?;
    let remote_url = remote.success.then(|| redact_credentials(&remote.stdout));

    let upstream = run_git(&repo, &["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]).await?;
    let has_upstream = upstream.success;
    let (ahead, behind) = if has_upstream {
        let counts = run_git(&repo, &["rev-list", "--left-right", "--count", "@{u}...HEAD"]).await?;
        counts
            .success
            .then(|| parse_ahead_behind(&counts.stdout))
            .flatten()
            .unwrap_or((0, 0))
    } else {
        (0, 0)
    };

    let bundle_exists = bundle_path(&repo).is_file();
    let dirty = run_git(&repo, &["status", "--porcelain", "--", BUNDLE_FILE_NAME]).await?;
    let bundle_dirty = dirty.success && !dirty.stdout.is_empty();

    Ok(GitRepoStatus {
        branch,
        remote_url,
        has_upstream,
        ahead,
        behind,
        bundle_exists,
        bundle_dirty,
    })
}

/// Fast-forward pull. Never creates merge commits and never rewrites local history; if the
/// branches diverged the user gets the git message and resolves it outside the app.
#[tauri::command]
pub async fn team_git_pull(repo_path: String) -> Result<String, String> {
    let repo = validate_repo_dir(&repo_path)?;
    let out = run_git(&repo, &["pull", "--ff-only"]).await?;
    if out.success {
        Ok(out.stdout)
    } else {
        Err(git_error("pull", &out))
    }
}

/// Reads the bundle from the repository, or `None` when it does not exist yet.
#[tauri::command]
pub async fn team_git_read_bundle(repo_path: String) -> Result<Option<String>, String> {
    let repo = validate_repo_dir(&repo_path)?;
    let path = bundle_path(&repo);
    if !path.is_file() {
        return Ok(None);
    }
    let meta = tokio::fs::metadata(&path)
        .await
        .map_err(|e| format!("Failed to read bundle: {e}"))?;
    if meta.len() as usize > MAX_BUNDLE_BYTES {
        return Err("Bundle in the repository is too large".into());
    }
    tokio::fs::read_to_string(&path)
        .await
        .map(Some)
        .map_err(|e| format!("Failed to read bundle: {e}"))
}

/// Writes the bundle, commits it (only that file) and optionally pushes.
#[tauri::command]
pub async fn team_git_publish(
    repo_path: String,
    content: String,
    commit_message: String,
    push: bool,
) -> Result<GitPublishResult, String> {
    let repo = validate_repo_dir(&repo_path)?;
    let message = sanitize_commit_message(&commit_message)?;
    validate_bundle_content(&content)?;

    write_bundle_atomically(&repo, &content).await?;

    let add = run_git(&repo, &["add", "--", BUNDLE_FILE_NAME]).await?;
    if !add.success {
        return Err(git_error("add", &add));
    }

    // `diff --cached --quiet` exits 1 when there is something staged for this path.
    let staged = run_git(&repo, &["diff", "--cached", "--quiet", "--", BUNDLE_FILE_NAME]).await?;
    let committed = if staged.success {
        false
    } else {
        let commit = run_git(&repo, &["commit", "-m", &message, "--", BUNDLE_FILE_NAME]).await?;
        if !commit.success {
            return Err(git_error("commit", &commit));
        }
        true
    };

    if !push {
        return Ok(GitPublishResult { committed, pushed: false, push_skipped_reason: None });
    }

    let remote = run_git(&repo, &["remote", "get-url", "origin"]).await?;
    if !remote.success {
        return Ok(GitPublishResult {
            committed,
            pushed: false,
            push_skipped_reason: Some("no_remote".into()),
        });
    }

    let upstream = run_git(&repo, &["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]).await?;
    let push_out = if upstream.success {
        run_git(&repo, &["push"]).await?
    } else {
        run_git(&repo, &["push", "--set-upstream", "origin", "HEAD"]).await?
    };
    if !push_out.success {
        return Err(git_error("push", &push_out));
    }

    Ok(GitPublishResult { committed, pushed: true, push_skipped_reason: None })
}

/// Writes through a temporary file in the same directory and renames it into place, so a
/// crash never leaves a half-written bundle in the working tree.
async fn write_bundle_atomically(repo: &Path, content: &str) -> Result<(), String> {
    let final_path = bundle_path(repo);
    let tmp_path = repo.join(format!(".{BUNDLE_FILE_NAME}.tmp"));
    {
        let mut file = tokio::fs::File::create(&tmp_path)
            .await
            .map_err(|e| format!("Failed to write bundle: {e}"))?;
        file.write_all(content.as_bytes())
            .await
            .map_err(|e| format!("Failed to write bundle: {e}"))?;
        file.flush().await.map_err(|e| format!("Failed to write bundle: {e}"))?;
    }
    tokio::fs::rename(&tmp_path, &final_path).await.map_err(|e| {
        let _ = std::fs::remove_file(&tmp_path);
        format!("Failed to write bundle: {e}")
    })
}
