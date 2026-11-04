use super::validate::*;
use super::*;
use std::process::Command as StdCommand;

mod validate_repo_dir_tests {
    use super::*;

    #[test]
    fn rejects_empty_relative_and_missing_paths() {
        assert!(validate_repo_dir("").is_err());
        assert!(validate_repo_dir("   ").is_err());
        assert!(validate_repo_dir("relative/path").is_err());
        assert!(validate_repo_dir("/definitely/not/here/xyz").is_err());
    }

    #[test]
    fn rejects_folders_that_are_not_repositories() {
        let dir = tempfile::tempdir().unwrap();
        let err = validate_repo_dir(dir.path().to_str().unwrap()).unwrap_err();
        assert!(err.contains("not a Git repository"));
    }

    #[test]
    fn accepts_a_folder_with_a_git_entry_and_canonicalizes_it() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir(dir.path().join(".git")).unwrap();
        let resolved = validate_repo_dir(dir.path().to_str().unwrap()).unwrap();
        assert_eq!(resolved, dir.path().canonicalize().unwrap());
    }

    #[test]
    fn accepts_a_worktree_style_git_file() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join(".git"), "gitdir: /elsewhere").unwrap();
        assert!(validate_repo_dir(dir.path().to_str().unwrap()).is_ok());
    }

    #[test]
    fn rejects_a_file_path() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("a.txt");
        std::fs::write(&file, "x").unwrap();
        assert!(validate_repo_dir(file.to_str().unwrap()).is_err());
    }
}

mod commit_message_tests {
    use super::*;

    #[test]
    fn trims_and_accepts_normal_messages() {
        assert_eq!(sanitize_commit_message("  sync workspace \n").unwrap(), "sync workspace");
    }

    #[test]
    fn rejects_empty_nul_and_oversized_messages() {
        assert!(sanitize_commit_message("   ").is_err());
        assert!(sanitize_commit_message("a\0b").is_err());
        assert!(sanitize_commit_message(&"x".repeat(201)).is_err());
        assert!(sanitize_commit_message(&"x".repeat(200)).is_ok());
    }

    #[test]
    fn leading_dashes_are_data_not_options() {
        // The message is always passed as the value of `-m`, never as its own argument.
        assert_eq!(sanitize_commit_message("--amend").unwrap(), "--amend");
    }
}

mod bundle_content_tests {
    use super::*;

    #[test]
    fn accepts_a_json_object() {
        assert!(validate_bundle_content(r#"{"version":"2.0"}"#).is_ok());
    }

    #[test]
    fn rejects_empty_non_object_and_invalid_json() {
        assert!(validate_bundle_content("").is_err());
        assert!(validate_bundle_content("[]").is_err());
        assert!(validate_bundle_content("42").is_err());
        assert!(validate_bundle_content("{not json").is_err());
    }
}

mod parse_ahead_behind_tests {
    use super::*;

    #[test]
    fn reads_behind_then_ahead() {
        assert_eq!(parse_ahead_behind("2\t5"), Some((5, 2)));
        assert_eq!(parse_ahead_behind("0 0\n"), Some((0, 0)));
    }

    #[test]
    fn rejects_malformed_output() {
        assert_eq!(parse_ahead_behind(""), None);
        assert_eq!(parse_ahead_behind("1"), None);
        assert_eq!(parse_ahead_behind("a b"), None);
        assert_eq!(parse_ahead_behind("1 2 3"), None);
    }
}

mod redact_credentials_tests {
    use super::*;

    #[test]
    fn strips_user_and_token_from_urls() {
        assert_eq!(
            redact_credentials("https://user:ghp_secret@github.com/org/repo.git"),
            "https://github.com/org/repo.git"
        );
    }

    #[test]
    fn keeps_urls_without_credentials_and_plain_text() {
        assert_eq!(redact_credentials("https://github.com/o/r"), "https://github.com/o/r");
        assert_eq!(redact_credentials("fatal: no remote"), "fatal: no remote");
    }

    #[test]
    fn redacts_every_url_in_a_message() {
        let text = "fatal: unable to access 'https://a:b@h1.com/x' and https://c@h2.com/y";
        let out = redact_credentials(text);
        assert!(!out.contains("a:b"));
        assert!(!out.contains("c@"));
        assert!(out.contains("https://h1.com/x"));
        assert!(out.contains("https://h2.com/y"));
    }
}

// --- End-to-end tests against a real `git` binary -------------------------

fn git_available() -> bool {
    StdCommand::new("git").arg("--version").output().map(|o| o.status.success()).unwrap_or(false)
}

fn git(dir: &std::path::Path, args: &[&str]) {
    let status = StdCommand::new("git").args(args).current_dir(dir).status().unwrap();
    assert!(status.success(), "git {args:?} failed");
}

fn init_repo(dir: &std::path::Path) {
    git(dir, &["init", "-q", "-b", "main"]);
    git(dir, &["config", "user.email", "test@example.com"]);
    git(dir, &["config", "user.name", "Test"]);
    git(dir, &["config", "commit.gpgsign", "false"]);
}

#[tokio::test]
async fn publish_commits_only_the_bundle_and_is_idempotent() {
    if !git_available() {
        return;
    }
    let dir = tempfile::tempdir().unwrap();
    init_repo(dir.path());
    std::fs::write(dir.path().join("unrelated.txt"), "keep me out of the commit").unwrap();
    let repo = dir.path().to_str().unwrap().to_string();

    let first = team_git_publish(repo.clone(), r#"{"version":"2.0"}"#.into(), "sync".into(), false)
        .await
        .unwrap();
    assert!(first.committed);
    assert!(!first.pushed);

    let tracked = StdCommand::new("git")
        .args(["ls-files"])
        .current_dir(dir.path())
        .output()
        .unwrap();
    assert_eq!(String::from_utf8_lossy(&tracked.stdout).trim(), BUNDLE_FILE_NAME);

    let second = team_git_publish(repo.clone(), r#"{"version":"2.0"}"#.into(), "sync".into(), false)
        .await
        .unwrap();
    assert!(!second.committed, "unchanged content must not create an empty commit");

    let read = team_git_read_bundle(repo.clone()).await.unwrap();
    assert_eq!(read.as_deref(), Some(r#"{"version":"2.0"}"#));
}

#[tokio::test]
async fn publish_reports_a_missing_remote_instead_of_failing() {
    if !git_available() {
        return;
    }
    let dir = tempfile::tempdir().unwrap();
    init_repo(dir.path());
    let repo = dir.path().to_str().unwrap().to_string();

    let result = team_git_publish(repo, r#"{"a":1}"#.into(), "sync".into(), true).await.unwrap();
    assert!(result.committed);
    assert!(!result.pushed);
    assert_eq!(result.push_skipped_reason.as_deref(), Some("no_remote"));
}

#[tokio::test]
async fn publish_rejects_bad_input_before_touching_the_repo() {
    if !git_available() {
        return;
    }
    let dir = tempfile::tempdir().unwrap();
    init_repo(dir.path());
    let repo = dir.path().to_str().unwrap().to_string();

    assert!(team_git_publish(repo.clone(), "not json".into(), "m".into(), false).await.is_err());
    assert!(team_git_publish(repo.clone(), "{}".into(), "  ".into(), false).await.is_err());
    assert!(!dir.path().join(BUNDLE_FILE_NAME).exists());
}

#[tokio::test]
async fn status_pull_and_push_roundtrip_through_a_bare_remote() {
    if !git_available() {
        return;
    }
    let remote = tempfile::tempdir().unwrap();
    git(remote.path(), &["init", "-q", "--bare", "-b", "main"]);
    let remote_url = remote.path().to_str().unwrap();

    let alice = tempfile::tempdir().unwrap();
    init_repo(alice.path());
    git(alice.path(), &["remote", "add", "origin", remote_url]);
    let alice_path = alice.path().to_str().unwrap().to_string();

    let published = team_git_publish(alice_path.clone(), r#"{"from":"alice"}"#.into(), "alice".into(), true)
        .await
        .unwrap();
    assert!(published.committed && published.pushed);

    let status = team_git_status(alice_path.clone()).await.unwrap();
    assert_eq!(status.branch.as_deref(), Some("main"));
    assert!(status.has_upstream);
    assert_eq!((status.ahead, status.behind), (0, 0));
    assert!(status.bundle_exists && !status.bundle_dirty);

    // Bob clones, Alice publishes again, Bob sees "behind 1" and fast-forwards.
    let bob_parent = tempfile::tempdir().unwrap();
    git(bob_parent.path(), &["clone", "-q", remote_url, "bob"]);
    let bob = bob_parent.path().join("bob");
    git(&bob, &["config", "user.email", "bob@example.com"]);
    git(&bob, &["config", "user.name", "Bob"]);
    let bob_path = bob.to_str().unwrap().to_string();

    team_git_publish(alice_path, r#"{"from":"alice","n":2}"#.into(), "alice 2".into(), true)
        .await
        .unwrap();
    git(&bob, &["fetch", "-q"]);

    let behind = team_git_status(bob_path.clone()).await.unwrap();
    assert_eq!((behind.ahead, behind.behind), (0, 1));

    team_git_pull(bob_path.clone()).await.unwrap();
    let content = team_git_read_bundle(bob_path).await.unwrap().unwrap();
    assert!(content.contains(r#""n":2"#));
}
