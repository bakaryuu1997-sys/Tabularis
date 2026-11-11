//! Resolves files that belong to an installed plugin without letting a caller escape the plugin folder.
//!
//! `read_plugin_file` is reachable from the webview, so both the plugin id and the file path are untrusted.
//! `Path::join` replaces the base when given an absolute path (or a drive prefix on Windows), and `..`
//! climbs out of it, so neither value may be passed to `join` unchecked.

use std::path::{Component, Path, PathBuf};

const MAX_PLUGIN_ID_LEN: usize = 128;

/// Plugin ids are folder names: ASCII letters, digits, `-`, `_` and `.`, and never only dots.
pub fn is_valid_plugin_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= MAX_PLUGIN_ID_LEN
        && id.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
        && id.chars().any(|c| c != '.')
}

/// Validates a relative file path and returns it with `/` separators. Rejects empty paths, NUL bytes,
/// absolute paths, drive prefixes, `..` and `.` components, and any component containing `:`.
pub fn normalize_relative_path(file_path: &str) -> Result<PathBuf, String> {
    const INVALID: &str = "Invalid file path: must be relative and stay inside the plugin folder";
    if file_path.trim().is_empty() || file_path.contains('\0') {
        return Err(INVALID.into());
    }
    let unified = file_path.replace('\\', "/");
    let mut clean = PathBuf::new();
    for component in Path::new(&unified).components() {
        match component {
            Component::Normal(part) => {
                let part = part.to_string_lossy();
                if part.contains(':') {
                    return Err(INVALID.into());
                }
                clean.push(part.as_ref());
            }
            _ => return Err(INVALID.into()),
        }
    }
    if clean.as_os_str().is_empty() {
        return Err(INVALID.into());
    }
    Ok(clean)
}

/// Resolves `<plugins_dir>/<plugin_id>/<file_path>` and checks, after following symlinks, that the result
/// is still inside the plugin's own folder.
pub fn resolve_plugin_file(plugins_dir: &Path, plugin_id: &str, file_path: &str) -> Result<PathBuf, String> {
    if !is_valid_plugin_id(plugin_id) {
        return Err("Invalid plugin id".into());
    }
    let relative = normalize_relative_path(file_path)?;

    let plugin_root = plugins_dir
        .join(plugin_id)
        .canonicalize()
        .map_err(|_| format!("Plugin '{plugin_id}' is not installed"))?;
    let resolved = plugin_root
        .join(&relative)
        .canonicalize()
        .map_err(|_| format!("File '{file_path}' was not found in plugin '{plugin_id}'"))?;

    if !resolved.starts_with(&plugin_root) {
        return Err("Invalid file path: must stay inside the plugin folder".into());
    }
    Ok(resolved)
}
