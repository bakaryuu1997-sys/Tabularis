use std::fs;
use std::time::Duration;

use crate::drivers::driver_trait::PluginManifest;
use crate::plugins::installer::{self, InstalledPluginInfo};
use crate::plugins::manager::ConfigManifest;
use crate::plugins::registry::{self, RegistryPluginWithStatus, RegistryReleaseWithStatus};
use tauri::AppHandle;
use tokio::time::sleep;

#[tauri::command]
pub async fn fetch_plugin_registry(
    app: AppHandle,
) -> Result<Vec<RegistryPluginWithStatus>, String> {
    let config = crate::config::load_config_internal(&app);
    let remote = registry::fetch_registry(config.custom_registry_url.as_deref()).await?;
    let installed = installer::list_installed()?;
    let platform = registry::get_current_platform();

    let result = remote
        .plugins
        .into_iter()
        .map(|plugin| {
            let installed_version = installed
                .iter()
                .find(|i| i.id == plugin.id)
                .map(|i| i.version.clone());

            let update_available = installed_version
                .as_ref()
                .map(|iv| iv != &plugin.latest_version)
                .unwrap_or(false);

            let releases: Vec<RegistryReleaseWithStatus> = plugin
                .releases
                .iter()
                .map(|r| {
                    let platform_supported =
                        r.assets.contains_key(&platform) || r.assets.contains_key("universal");
                    RegistryReleaseWithStatus {
                        version: r.version.clone(),
                        min_tabularis_version: r.min_tabularis_version.clone(),
                        platform_supported,
                    }
                })
                .collect();

            let platform_supported = releases
                .iter()
                .any(|r| r.version == plugin.latest_version && r.platform_supported);

            RegistryPluginWithStatus {
                id: plugin.id,
                name: plugin.name,
                description: plugin.description,
                author: plugin.author,
                homepage: plugin.homepage,
                latest_version: plugin.latest_version,
                releases,
                installed_version,
                update_available,
                platform_supported,
            }
        })
        .collect();

    Ok(result)
}

#[tauri::command]
pub async fn install_plugin(
    app: AppHandle,
    plugin_id: String,
    version: Option<String>,
) -> Result<(), String> {
    // Updating an installed plugin must stop the existing process first,
    // otherwise the OS may keep files locked while we replace the directory.
    crate::drivers::registry::unregister_driver(&plugin_id).await;
    crate::drivers::registry::unregister_manifest(&plugin_id).await;
    sleep(Duration::from_millis(500)).await;

    let config = crate::config::load_config_internal(&app);
    let remote = registry::fetch_registry(config.custom_registry_url.as_deref()).await?;
    let platform = registry::get_current_platform();

    let plugin = remote
        .plugins
        .iter()
        .find(|p| p.id == plugin_id)
        .ok_or_else(|| format!("Plugin '{}' not found in registry", plugin_id))?;

    let target_version = version.as_deref().unwrap_or(&plugin.latest_version);

    let release = plugin
        .releases
        .iter()
        .find(|r| r.version == target_version)
        .ok_or_else(|| format!("No release found for version {}", target_version))?;

    // Resolve the asset key we will actually download so we can pair it with the
    // matching checksum from the registry.
    let asset_key = if release.assets.contains_key(&platform) {
        platform.clone()
    } else if release.assets.contains_key("universal") {
        "universal".to_string()
    } else {
        return Err(format!(
            "Plugin '{}' does not support platform '{}'",
            plugin_id, platform
        ));
    };
    let download_url = &release.assets[&asset_key];

    // Integrity policy:
    //  - checksum present for this asset -> verify before install.
    //  - release publishes checksums but none for this asset -> suspicious, refuse.
    //  - no checksums at all (legacy) -> install with a loud warning.
    let expected_sha256 = release.checksums.get(&asset_key).map(|s| s.as_str());
    if expected_sha256.is_none() && !release.checksums.is_empty() {
        return Err(format!(
            "Plugin '{}' release {} publishes checksums but none for asset '{}'. Refusing to install.",
            plugin_id, target_version, asset_key
        ));
    }
    if expected_sha256.is_none() {
        log::warn!(
            "Plugin '{}' release {} has no checksum in the registry; installing WITHOUT integrity verification.",
            plugin_id,
            target_version
        );
    }

    installer::download_and_install(&plugin_id, download_url, expected_sha256).await?;

    let installed_plugin = installer::read_installed_plugin(&plugin_id)?;
    if installed_plugin.id != plugin_id {
        return Err(format!(
            "Plugin archive mismatch: registry expected id '{}' but installed manifest reports '{}'",
            plugin_id, installed_plugin.id
        ));
    }
    if installed_plugin.version != target_version {
        return Err(format!(
            "Plugin archive version mismatch: registry expected version '{}' but installed manifest reports '{}'. The published asset appears inconsistent.",
            target_version, installed_plugin.version
        ));
    }

    // Hot-register the new driver (no restart needed)
    let plugin_cfg = config.plugins.as_ref().and_then(|m| m.get(&plugin_id));
    let interpreter_override = plugin_cfg.and_then(|c| c.interpreter.clone());
    let settings = plugin_cfg.map(|c| c.settings.clone()).unwrap_or_default();
    let plugins_dir = installer::get_plugins_dir()?;
    let plugin_dir = plugins_dir.join(&plugin_id);
    crate::plugins::manager::load_plugin_from_dir(&plugin_dir, interpreter_override, settings)
        .await
        .map_err(|e| format!("Plugin installed but failed to load: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn uninstall_plugin(plugin_id: String) -> Result<(), String> {
    // Unregister from in-memory driver registry first
    crate::drivers::registry::unregister_driver(&plugin_id).await;
    crate::drivers::registry::unregister_manifest(&plugin_id).await;

    // Remove from filesystem
    installer::uninstall(&plugin_id)?;

    Ok(())
}

#[tauri::command]
pub async fn get_installed_plugins() -> Result<Vec<InstalledPluginInfo>, String> {
    installer::list_installed()
}

/// Stops the plugin process and removes the driver from the registry.
/// The plugin files remain on disk and can be re-enabled with `enable_plugin`.
#[tauri::command]
pub async fn disable_plugin(plugin_id: String) -> Result<(), String> {
    crate::drivers::registry::unregister_driver(&plugin_id).await;
    crate::drivers::registry::unregister_manifest(&plugin_id).await;
    Ok(())
}

/// Loads the plugin from disk and registers its driver, starting the plugin process.
#[tauri::command]
pub async fn enable_plugin(app: AppHandle, plugin_id: String) -> Result<(), String> {
    let config = crate::config::load_config_internal(&app);
    let plugin_cfg = config.plugins.as_ref().and_then(|m| m.get(&plugin_id));
    let interpreter_override = plugin_cfg.and_then(|c| c.interpreter.clone());
    let settings = plugin_cfg.map(|c| c.settings.clone()).unwrap_or_default();
    let plugins_dir = installer::get_plugins_dir()?;
    let plugin_dir = plugins_dir.join(&plugin_id);
    if !plugin_dir.exists() {
        return Err(format!("Plugin '{}' is not installed", plugin_id));
    }
    crate::plugins::manager::load_plugin_from_dir(&plugin_dir, interpreter_override, settings)
        .await?;
    Ok(())
}

/// Reads a plugin's manifest.json from disk and returns a PluginManifest.
/// Useful for retrieving setting definitions for disabled plugins.
#[tauri::command]
pub async fn get_plugin_manifest(plugin_id: String) -> Result<PluginManifest, String> {
    let plugins_dir = installer::get_plugins_dir()?;
    let manifest_path = plugins_dir.join(&plugin_id).join("manifest.json");

    let manifest_str = fs::read_to_string(&manifest_path)
        .map_err(|e| format!("Failed to read manifest for '{}': {}", plugin_id, e))?;

    let config: ConfigManifest = serde_json::from_str(&manifest_str)
        .map_err(|e| format!("Failed to parse manifest for '{}': {}", plugin_id, e))?;

    Ok(PluginManifest {
        id: config.id,
        name: config.name,
        version: config.version,
        description: config.description,
        default_port: config.default_port,
        capabilities: config.capabilities,
        is_builtin: false,
        default_username: config.default_username.unwrap_or_default(),
        color: config.color,
        icon: config.icon,
        settings: config.settings,
        ui_extensions: config.ui_extensions,
        permissions: config.permissions,
    })
}

/// Returns the absolute filesystem path of an installed plugin's directory.
#[tauri::command]
pub fn get_plugin_dir(plugin_id: String) -> Result<String, String> {
    let plugins_dir = installer::get_plugins_dir()?;
    let plugin_dir = plugins_dir.join(&plugin_id);
    if !plugin_dir.exists() {
        return Err(format!("Plugin '{}' is not installed", plugin_id));
    }
    plugin_dir
        .to_str()
        .ok_or_else(|| "Plugin path contains invalid UTF-8".to_string())
        .map(|s| s.to_string())
}

/// Reads a file from an installed plugin's directory.
/// Both values come from the webview: the id must be a plain folder name and the path must stay inside
/// that plugin's folder, also after resolving symlinks (see `plugins::safe_path`).
#[tauri::command]
pub fn read_plugin_file(plugin_id: String, file_path: String) -> Result<String, String> {
    let plugins_dir = installer::get_plugins_dir()?;
    let full_path = crate::plugins::safe_path::resolve_plugin_file(&plugins_dir, &plugin_id, &file_path)?;
    fs::read_to_string(&full_path).map_err(|e| {
        format!(
            "Failed to read '{}' from plugin '{}': {}",
            file_path, plugin_id, e
        )
    })
}

/// Runs a read-only query on behalf of plugin UI code (`usePluginQuery`). Anything that is not a single
/// read-only statement is refused before it reaches the database; see `plugins::query_guard`.
#[tauri::command]
pub async fn execute_plugin_query(
    app: AppHandle,
    state: tauri::State<'_, crate::commands::QueryCancellationState>,
    connection_id: String,
    query: String,
    schema: Option<String>,
) -> Result<crate::models::QueryResult, String> {
    crate::plugins::query_guard::ensure_read_only(&query)?;
    crate::commands::execute_query(app, state, connection_id, query, None, None, schema).await
}
