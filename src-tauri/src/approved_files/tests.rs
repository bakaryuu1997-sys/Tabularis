use super::{approve, require_approved};

fn temp_file_with(content: &[u8]) -> tempfile::NamedTempFile {
    use std::io::Write;
    let mut file = tempfile::NamedTempFile::new().unwrap();
    file.write_all(content).unwrap();
    file
}

#[test]
fn a_file_that_was_never_picked_is_refused() {
    let file = temp_file_with(b"secret");
    let err = require_approved(file.path().to_str().unwrap()).unwrap_err();
    assert_eq!(err, "This file was not selected through the file dialog");
}

#[test]
fn a_picked_file_is_accepted() {
    let file = temp_file_with(b"data");
    let canonical = approve(file.path()).unwrap();
    assert_eq!(require_approved(file.path().to_str().unwrap()).unwrap(), canonical);
}

#[test]
fn approval_is_idempotent() {
    let file = temp_file_with(b"data");
    assert_eq!(approve(file.path()).unwrap(), approve(file.path()).unwrap());
}

#[test]
fn approving_a_missing_file_fails() {
    assert!(approve(std::path::Path::new("/definitely/not/here.bin")).is_err());
}

#[test]
fn a_missing_path_is_refused_like_an_unapproved_one() {
    assert!(require_approved("/definitely/not/here.bin").is_err());
    assert!(require_approved("").is_err());
}

#[test]
fn approving_one_file_does_not_approve_its_siblings() {
    let dir = tempfile::tempdir().unwrap();
    let picked = dir.path().join("picked.png");
    let other = dir.path().join("other.png");
    std::fs::write(&picked, b"a").unwrap();
    std::fs::write(&other, b"b").unwrap();
    approve(&picked).unwrap();
    assert!(require_approved(picked.to_str().unwrap()).is_ok());
    assert!(require_approved(other.to_str().unwrap()).is_err());
}

#[test]
fn dot_dot_segments_resolve_to_the_approved_file_only() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::create_dir(dir.path().join("sub")).unwrap();
    let picked = dir.path().join("sub").join("a.bin");
    let other = dir.path().join("b.bin");
    std::fs::write(&picked, b"a").unwrap();
    std::fs::write(&other, b"b").unwrap();
    approve(&picked).unwrap();
    let via_dots = format!("{}/sub/../sub/a.bin", dir.path().display());
    assert!(require_approved(&via_dots).is_ok());
    let escape = format!("{}/sub/../b.bin", dir.path().display());
    assert!(require_approved(&escape).is_err());
}

#[cfg(unix)]
#[test]
fn a_symlink_swapped_in_after_approval_is_refused() {
    let dir = tempfile::tempdir().unwrap();
    let picked = dir.path().join("photo.png");
    let secret = dir.path().join("secret.txt");
    std::fs::write(&picked, b"img").unwrap();
    std::fs::write(&secret, b"top secret").unwrap();
    approve(&picked).unwrap();

    std::fs::remove_file(&picked).unwrap();
    std::os::unix::fs::symlink(&secret, &picked).unwrap();

    assert!(require_approved(picked.to_str().unwrap()).is_err());
}
