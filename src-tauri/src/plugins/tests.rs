use std::fs;

use tempfile::tempdir;

use super::installer::{read_plugin_info_from_dir, sha256_hex, verify_checksum};

#[test]
fn reads_installed_plugin_info_from_manifest() {
    let dir = tempdir().expect("temp dir");
    let manifest_path = dir.path().join("manifest.json");
    fs::write(
        &manifest_path,
        r#"{
  "id": "google-sheets",
  "name": "Google Sheets",
  "version": "0.2.0",
  "description": "Query Sheets"
}"#,
    )
    .expect("write manifest");

    let plugin = read_plugin_info_from_dir(dir.path()).expect("read manifest");

    assert_eq!(plugin.id, "google-sheets");
    assert_eq!(plugin.name, "Google Sheets");
    assert_eq!(plugin.version, "0.2.0");
    assert_eq!(plugin.description, "Query Sheets");
}

#[test]
fn returns_error_for_invalid_manifest() {
    let dir = tempdir().expect("temp dir");
    let manifest_path = dir.path().join("manifest.json");
    fs::write(&manifest_path, "{ invalid json").expect("write manifest");

    let error = read_plugin_info_from_dir(dir.path()).expect_err("invalid manifest");

    assert!(error.contains("Failed to parse plugin manifest"));
}

#[test]
fn verify_checksum_accepts_matching_digest() {
    let bytes = b"tabularis plugin archive";
    let expected = sha256_hex(bytes);
    assert!(verify_checksum("demo", bytes, &expected).is_ok());
}

#[test]
fn verify_checksum_is_case_and_whitespace_insensitive() {
    let bytes = b"tabularis plugin archive";
    let expected = format!("  {}  ", sha256_hex(bytes).to_uppercase());
    assert!(verify_checksum("demo", bytes, &expected).is_ok());
}

#[test]
fn verify_checksum_rejects_tampered_archive() {
    let expected = sha256_hex(b"original archive");
    let error = verify_checksum("demo", b"tampered archive", &expected)
        .expect_err("mismatch must fail");
    assert!(error.contains("checksum mismatch"));
    assert!(error.contains("Refusing to install"));
}
