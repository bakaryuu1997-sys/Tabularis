use crate::logger::{LogEntry, SharedLogBuffer};
use serde::Deserialize;
use tauri::State;

#[derive(Debug, Deserialize)]
pub struct GetLogsRequest {
    limit: Option<usize>,
    level_filter: Option<String>,
}

#[tauri::command]
pub fn get_logs(log_buffer: State<SharedLogBuffer>, request: GetLogsRequest) -> Vec<LogEntry> {
    log::debug!(
        "Getting logs with limit: {:?}, filter: {:?}",
        request.limit,
        request.level_filter
    );
    let buffer = log_buffer.lock().unwrap();
    let entries = buffer.get_entries(request.limit, request.level_filter);
    log::debug!("Returning {} log entries", entries.len());
    entries
}

#[tauri::command]
pub fn clear_logs(log_buffer: State<SharedLogBuffer>) -> Result<(), String> {
    let mut buffer = log_buffer.lock().unwrap();
    buffer.clear();
    Ok(())
}

#[tauri::command]
pub fn get_log_settings(log_buffer: State<SharedLogBuffer>) -> LogSettings {
    let buffer = log_buffer.lock().unwrap();
    LogSettings {
        enabled: buffer.is_enabled(),
        max_size: buffer.get_max_size(),
        current_count: buffer.get_entries(None, None).len(),
    }
}

#[tauri::command]
pub fn set_log_enabled(log_buffer: State<SharedLogBuffer>, enabled: bool) -> Result<(), String> {
    let mut buffer = log_buffer.lock().unwrap();
    buffer.set_enabled(enabled);
    Ok(())
}

#[tauri::command]
pub fn set_log_max_size(log_buffer: State<SharedLogBuffer>, max_size: usize) -> Result<(), String> {
    if max_size == 0 || max_size > 10000 {
        return Err("Max size must be between 1 and 10000".to_string());
    }
    let mut buffer = log_buffer.lock().unwrap();
    buffer.set_max_size(max_size);
    Ok(())
}

#[derive(Debug, serde::Serialize)]
pub struct LogSettings {
    pub enabled: bool,
    pub max_size: usize,
    pub current_count: usize,
}

/// Plain-text form of the log entries written by the export.
pub(crate) fn format_log_export(entries: &[LogEntry]) -> String {
    let mut content = String::from("Tabularis Application Logs\n==========================\n\n");
    for entry in entries {
        content.push_str(&format!(
            "[{}] [{}] {}",
            entry.timestamp,
            entry.level.to_uppercase(),
            entry.message
        ));
        if let Some(target) = &entry.target {
            content.push_str(&format!(" (target: {})", target));
        }
        content.push('\n');
    }
    content
}

/// Shows the native "Save as" dialog and writes the log there. The destination is chosen in Rust, never passed
/// in by the webview, so a script in the page cannot use this command to overwrite an arbitrary file.
/// Returns the chosen path, or `None` when the dialog is cancelled.
#[tauri::command]
pub async fn export_logs_with_dialog(
    app: tauri::AppHandle,
    log_buffer: State<'_, SharedLogBuffer>,
    default_file_name: String,
) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;

    let content = {
        let buffer = log_buffer.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
        let entries = buffer.get_entries(None, None);
        if entries.is_empty() {
            return Err("No logs to export".to_string());
        }
        format_log_export(&entries)
    };

    let chosen = app
        .dialog()
        .file()
        .set_file_name(&default_file_name)
        .add_filter("Log Files", &["log"])
        .blocking_save_file();
    let Some(file_path) = chosen else {
        return Ok(None);
    };
    let path = file_path
        .into_path()
        .map_err(|e| format!("Invalid destination: {}", e))?;
    std::fs::write(&path, content).map_err(|e| format!("Failed to write log file: {}", e))?;

    log::info!("Logs exported to: {:?}", path);
    Ok(Some(path.display().to_string()))
}

#[tauri::command]
pub fn test_log() -> Result<(), String> {
    log::info!("Test log message from frontend");
    log::debug!("Debug test message: {}", 42);
    log::warn!("Warning test message");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::format_log_export;
    use crate::logger::LogEntry;

    fn entry(level: &str, message: &str, target: Option<&str>) -> LogEntry {
        LogEntry {
            timestamp: "2026-01-02T03:04:05Z".into(),
            level: level.into(),
            message: message.into(),
            target: target.map(String::from),
        }
    }

    #[test]
    fn export_lists_entries_with_upper_case_levels_and_targets() {
        let text = format_log_export(&[
            entry("info", "started", Some("tabularis::lib")),
            entry("warn", "slow", None),
        ]);
        assert!(text.starts_with("Tabularis Application Logs\n"));
        assert!(text.contains("[2026-01-02T03:04:05Z] [INFO] started (target: tabularis::lib)\n"));
        assert!(text.contains("[2026-01-02T03:04:05Z] [WARN] slow\n"));
    }
}
