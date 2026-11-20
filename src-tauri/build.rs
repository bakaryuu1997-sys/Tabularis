fn main() {
    tauri_build::build();
    embed_test_manifest_on_windows();
}

/// Test binaries do not get the app manifest that tauri-build embeds for the
/// application, so they fail to start on Windows (Common Controls v6 missing).
/// Embed a minimal manifest into test targets only.
fn embed_test_manifest_on_windows() {
    let target_os = std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    let target_env = std::env::var("CARGO_CFG_TARGET_ENV").unwrap_or_default();
    if target_os != "windows" || target_env != "msvc" {
        return;
    }
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR is set by cargo");
    let manifest = std::path::Path::new(&manifest_dir).join("windows-test-manifest.xml");
    println!("cargo:rerun-if-changed={}", manifest.display());
    println!("cargo:rustc-link-arg-tests=/MANIFEST:EMBED");
    println!("cargo:rustc-link-arg-tests=/MANIFESTINPUT:{}", manifest.display());
}
