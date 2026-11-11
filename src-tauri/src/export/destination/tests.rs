use super::ExportDestinationState;
use std::path::PathBuf;

#[test]
fn a_token_returns_the_path_it_was_issued_for() {
    let state = ExportDestinationState::default();
    let token = state.register(PathBuf::from("/tmp/a.csv"));
    assert_eq!(state.take(&token), Some(PathBuf::from("/tmp/a.csv")));
}

#[test]
fn a_token_works_only_once() {
    let state = ExportDestinationState::default();
    let token = state.register(PathBuf::from("/tmp/a.csv"));
    assert!(state.take(&token).is_some());
    assert!(state.take(&token).is_none());
}

#[test]
fn an_invented_path_or_token_is_refused() {
    let state = ExportDestinationState::default();
    state.register(PathBuf::from("/tmp/a.csv"));
    assert!(state.take("/home/user/.bashrc").is_none());
    assert!(state.take("").is_none());
    assert!(state.take("not-a-token").is_none());
}

#[test]
fn tokens_are_unique_and_independent() {
    let state = ExportDestinationState::default();
    let a = state.register(PathBuf::from("/tmp/a.csv"));
    let b = state.register(PathBuf::from("/tmp/b.csv"));
    assert_ne!(a, b);
    assert_eq!(state.take(&b), Some(PathBuf::from("/tmp/b.csv")));
    assert_eq!(state.take(&a), Some(PathBuf::from("/tmp/a.csv")));
}

#[test]
fn the_oldest_pending_destination_is_dropped_past_the_cap() {
    let state = ExportDestinationState::default();
    let first = state.register(PathBuf::from("/tmp/0.csv"));
    let mut last = String::new();
    for i in 1..=16 {
        last = state.register(PathBuf::from(format!("/tmp/{i}.csv")));
    }
    assert!(state.take(&first).is_none());
    assert_eq!(state.take(&last), Some(PathBuf::from("/tmp/16.csv")));
}
