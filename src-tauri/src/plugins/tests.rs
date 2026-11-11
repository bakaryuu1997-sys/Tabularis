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

mod safe_path_tests {
    use crate::plugins::safe_path::{is_valid_plugin_id, normalize_relative_path, resolve_plugin_file};
    use std::fs;

    fn plugins_dir_with(files: &[(&str, &str, &str)]) -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        for (plugin, file, content) in files {
            let path = dir.path().join(plugin).join(file);
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(path, content).unwrap();
        }
        dir
    }

    #[test]
    fn accepts_plain_plugin_ids_only() {
        for ok in ["duckdb", "my-plugin_2", "acme.driver", "A1"] {
            assert!(is_valid_plugin_id(ok), "{ok}");
        }
        for bad in ["", ".", "..", "...", "a/b", "a\\b", "../x", "/etc", "C:", "a b", "a\0b", &"x".repeat(129)] {
            assert!(!is_valid_plugin_id(bad), "{bad:?}");
        }
    }

    #[test]
    fn normalizes_good_relative_paths() {
        assert_eq!(normalize_relative_path("ui/panel.js").unwrap().to_string_lossy(), "ui/panel.js");
        assert_eq!(normalize_relative_path("ui\\panel.js").unwrap().to_string_lossy(), "ui/panel.js");
        assert_eq!(normalize_relative_path("a.js").unwrap().to_string_lossy(), "a.js");
        // An interior "." is harmless and is dropped.
        assert_eq!(normalize_relative_path("a/./b.js").unwrap().to_string_lossy(), "a/b.js");
    }

    #[test]
    fn rejects_escaping_or_absolute_paths() {
        for bad in [
            "", "  ", "../secret", "a/../../secret", "..\\..\\secret", "/etc/passwd", "\\\\server\\share",
            "C:\\Windows\\win.ini", "C:/Windows/win.ini", "./a.js", "a\0b",
        ] {
            assert!(normalize_relative_path(bad).is_err(), "{bad:?} should be rejected");
        }
    }

    #[test]
    fn reads_files_inside_the_plugin_folder() {
        let dir = plugins_dir_with(&[("p1", "ui/panel.js", "ok"), ("p2", "secret.txt", "other plugin")]);
        let path = resolve_plugin_file(dir.path(), "p1", "ui/panel.js").unwrap();
        assert_eq!(fs::read_to_string(path).unwrap(), "ok");
    }

    #[test]
    fn a_plugin_id_cannot_climb_out_or_name_an_absolute_folder() {
        let dir = plugins_dir_with(&[("p1", "a.js", "x")]);
        let outside = tempfile::tempdir().unwrap();
        fs::write(outside.path().join("passwd"), "root").unwrap();

        assert!(resolve_plugin_file(dir.path(), "..", "p1/a.js").is_err());
        assert!(resolve_plugin_file(dir.path(), "../p1", "a.js").is_err());
        assert!(resolve_plugin_file(dir.path(), outside.path().to_str().unwrap(), "passwd").is_err());
    }

    #[test]
    fn a_file_path_cannot_reach_another_plugin_or_the_disk_root() {
        let dir = plugins_dir_with(&[("p1", "a.js", "x"), ("p2", "secret.txt", "other plugin")]);
        assert!(resolve_plugin_file(dir.path(), "p1", "../p2/secret.txt").is_err());
        assert!(resolve_plugin_file(dir.path(), "p1", "/etc/passwd").is_err());
        assert!(resolve_plugin_file(dir.path(), "p1", "C:\\Windows\\win.ini").is_err());
    }

    #[test]
    fn missing_plugin_or_file_is_a_clean_error() {
        let dir = plugins_dir_with(&[("p1", "a.js", "x")]);
        assert!(resolve_plugin_file(dir.path(), "nope", "a.js").unwrap_err().contains("not installed"));
        assert!(resolve_plugin_file(dir.path(), "p1", "missing.js").unwrap_err().contains("not found"));
    }

    #[cfg(unix)]
    #[test]
    fn a_symlink_inside_the_plugin_cannot_point_outside_it() {
        let dir = plugins_dir_with(&[("p1", "a.js", "x")]);
        let outside = tempfile::tempdir().unwrap();
        fs::write(outside.path().join("secret.txt"), "top secret").unwrap();
        std::os::unix::fs::symlink(outside.path().join("secret.txt"), dir.path().join("p1").join("link.txt")).unwrap();
        assert!(resolve_plugin_file(dir.path(), "p1", "link.txt").is_err());
    }
}
