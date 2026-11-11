mod destination;
mod encoding;
mod format;
mod progress;
mod sink;

#[cfg(test)]
mod tests;

pub use destination::ExportDestinationState;
pub use encoding::EncodingWriter;
pub use format::{
    parse_csv_delimiter, value_to_csv_string, CsvEncoding, CsvStyle, ExportFormat, DEFAULT_CSV_DELIMITER,
};
pub use progress::{ProgressEmitter, DEFAULT_INTERVAL as DEFAULT_PROGRESS_INTERVAL};
pub use sink::{CsvSink, JsonSink, RowSink};

use std::collections::HashMap;
use std::fs::File;
use std::io::{BufWriter, Write};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter, Runtime, State};

use crate::commands::{
    expand_k8s_connection_params, expand_ssh_connection_params, find_connection_by_id,
    register_abort_handle, resolve_connection_params_with_id, unregister_abort_handle,
    AbortHandleMap,
};
use crate::drivers::{mysql, postgres, sqlite};
use crate::models::ConnectionParams;

pub struct ExportCancellationState {
    pub handles: Arc<Mutex<AbortHandleMap>>,
}

impl Default for ExportCancellationState {
    fn default() -> Self {
        Self {
            handles: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

#[derive(Clone, Serialize)]
struct ExportProgressPayload {
    rows_processed: u64,
}

const EXPORT_PROGRESS_EVENT: &str = "export_progress";

fn sanitize_query(query: &str) -> String {
    query.trim().trim_end_matches(';').to_string()
}

#[tauri::command]
pub async fn cancel_export(
    state: State<'_, ExportCancellationState>,
    connection_id: String,
) -> Result<(), String> {
    let entries = {
        let mut handles = state.handles.lock().unwrap();
        handles.remove(&connection_id).unwrap_or_default()
    };
    for handle in entries {
        handle.abort();
    }
    Ok(())
}

/// A destination picked in the "Save as" dialog. The path stays in the backend; `token` is passed back to
/// `export_query_to_file`.
#[derive(Serialize)]
pub struct ChosenExportFile {
    pub token: String,
    pub file_name: String,
}

/// What an export reports when it finishes.
#[derive(Serialize, Default, Debug, PartialEq, Eq)]
pub struct ExportOutcome {
    /// Characters the file's encoding could not represent, written as `?` (Shift_JIS only).
    pub replaced_characters: u64,
}

/// Shows the native "Save as" dialog for an export. The destination is chosen in Rust, never passed in by the
/// webview, so a script in the page cannot make an export write to an arbitrary file. Returns `None` when the
/// dialog is cancelled.
#[tauri::command]
pub async fn choose_export_file<R: Runtime>(
    app: AppHandle<R>,
    destinations: State<'_, ExportDestinationState>,
    default_file_name: String,
    format: String,
) -> Result<Option<ChosenExportFile>, String> {
    use tauri_plugin_dialog::DialogExt;

    let extension = match ExportFormat::parse(&format)? {
        ExportFormat::Csv => "csv",
        ExportFormat::Json => "json",
    };
    let chosen = app
        .dialog()
        .file()
        .set_file_name(&default_file_name)
        .add_filter(extension.to_uppercase(), &[extension])
        .blocking_save_file();
    let Some(file_path) = chosen else {
        return Ok(None);
    };
    let path = file_path
        .into_path()
        .map_err(|e| format!("Invalid destination: {}", e))?;
    let file_name = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    let token = destinations.register(path);
    Ok(Some(ChosenExportFile { token, file_name }))
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn export_query_to_file<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, ExportCancellationState>,
    destinations: State<'_, ExportDestinationState>,
    connection_id: String,
    query: String,
    destination_token: String,
    format: String,
    csv_delimiter: Option<String>,
    csv_preset: Option<String>,
    database: Option<String>,
) -> Result<ExportOutcome, String> {
    let sanitized_query = sanitize_query(&query);
    // Validate the options before the one-time token is used up.
    let export_format = ExportFormat::parse(&format)?;
    let delimiter = parse_csv_delimiter(csv_delimiter.as_deref());
    let csv_style = CsvStyle::from_preset(csv_preset.as_deref())?;
    let file_path = destinations
        .take(&destination_token)
        .ok_or_else(|| "The export destination expired. Choose the file again.".to_string())?;

    let saved_conn = find_connection_by_id(&app, &connection_id)?;
    let expanded_params = expand_ssh_connection_params(&app, &saved_conn.params).await?;
    let expanded_params = expand_k8s_connection_params(&app, &expanded_params).await?;
    let mut params = resolve_connection_params_with_id(&expanded_params, &connection_id)?;
    // Scope the export to the selected database on connections that expose multiple
    // databases (e.g. MySQL/MariaDB), so the query runs against the database the
    // user is viewing rather than the connection's primary database.
    if let Some(db) = database {
        params.database = crate::models::DatabaseSelection::Single(db);
    }
    let driver = saved_conn.params.driver.clone();

    let app_for_task = app.clone();
    let task_connection_id = connection_id.clone();

    let task = tokio::spawn(async move {
        let file = File::create(&file_path).map_err(|e| e.to_string())?;
        let writer = BufWriter::new(file);
        run_export(
            app_for_task,
            &driver,
            &params,
            &sanitized_query,
            writer,
            export_format,
            delimiter,
            csv_style,
        )
        .await
    });

    let abort_handle = Arc::new(task.abort_handle());
    register_abort_handle(
        &state.handles,
        task_connection_id.clone(),
        abort_handle.clone(),
    );

    let result = task.await;

    unregister_abort_handle(&state.handles, &task_connection_id, &abort_handle);

    match result {
        Ok(res) => res,
        Err(_) => Err("Export cancelled".into()),
    }
}

/// Wires the driver stream, the row sink, and the progress emitter together.
/// Kept as a free function so the spawned task body stays linear and the
/// pieces remain individually unit-testable.
#[allow(clippy::too_many_arguments)]
async fn run_export<R: Runtime>(
    app: AppHandle<R>,
    driver: &str,
    params: &ConnectionParams,
    query: &str,
    writer: BufWriter<File>,
    format: ExportFormat,
    delimiter: u8,
    csv_style: CsvStyle,
) -> Result<ExportOutcome, String> {
    let app_for_progress = app.clone();
    let mut progress = ProgressEmitter::new(DEFAULT_PROGRESS_INTERVAL, move |count| {
        let _ = app_for_progress.emit(
            EXPORT_PROGRESS_EVENT,
            ExportProgressPayload {
                rows_processed: count,
            },
        );
    });

    let mut outcome = ExportOutcome::default();
    match format {
        ExportFormat::Csv => {
            outcome.replaced_characters =
                export_csv(driver, params, query, writer, delimiter, csv_style, &mut progress).await?;
        }
        ExportFormat::Json => {
            let mut sink = JsonSink::new(writer);
            stream_to_sink(driver, params, query, &mut sink, &mut progress).await?;
            sink.finish()?;
        }
    }

    progress.finish();
    Ok(outcome)
}

/// Streams the query as CSV in the requested encoding. Returns how many characters the encoding could not
/// represent (always 0 for UTF-8).
async fn export_csv<F>(
    driver: &str,
    params: &ConnectionParams,
    query: &str,
    mut writer: BufWriter<File>,
    delimiter: u8,
    style: CsvStyle,
    progress: &mut ProgressEmitter<F>,
) -> Result<u64, String>
where
    F: FnMut(u64) + Send,
{
    if style.bom {
        writer.write_all(&UTF8_BOM).map_err(|e| e.to_string())?;
    }
    match style.encoding {
        CsvEncoding::Utf8 => {
            let mut sink = CsvSink::with_line_ending(writer, delimiter, style.crlf);
            stream_to_sink(driver, params, query, &mut sink, progress).await?;
            sink.finish()?;
            Ok(0)
        }
        CsvEncoding::ShiftJis => {
            let replaced = Arc::new(AtomicU64::new(0));
            let encoded = EncodingWriter::new(writer, encoding_rs::SHIFT_JIS, replaced.clone());
            let mut sink = CsvSink::with_line_ending(encoded, delimiter, style.crlf);
            stream_to_sink(driver, params, query, &mut sink, progress).await?;
            sink.finish()?;
            Ok(replaced.load(Ordering::Relaxed))
        }
    }
}

/// UTF-8 byte order mark. Excel uses it to detect UTF-8 instead of the system code page.
const UTF8_BOM: [u8; 3] = [0xEF, 0xBB, 0xBF];

async fn stream_to_sink<S, F>(
    driver: &str,
    params: &ConnectionParams,
    query: &str,
    sink: &mut S,
    progress: &mut ProgressEmitter<F>,
) -> Result<(), String>
where
    S: RowSink + Send,
    F: FnMut(u64) + Send,
{
    let mut on_row = |headers: &[String], values: &[Value]| -> Result<(), String> {
        sink.write_row(headers, values)?;
        progress.tick();
        Ok(())
    };

    match driver {
        "mysql" => mysql::export::stream_query(params, query, &mut on_row).await,
        "postgres" => postgres::export::stream_query(params, query, &mut on_row).await,
        "sqlite" => sqlite::export::stream_query(params, query, &mut on_row).await,
        // External plugin drivers: page through the driver's own paginated
        // `execute_query` and forward every row to the sink.
        other => stream_query_via_plugin(other, params, query, &mut on_row).await,
    }
}

/// Streams a query for an external plugin driver by repeatedly calling its
/// `execute_query` with the driver's pagination, forwarding each row to
/// `on_row`. Built-in drivers stream directly from the database; plugins only
/// expose paged query execution over JSON-RPC, so we drive that here.
async fn stream_query_via_plugin<F>(
    driver_id: &str,
    params: &ConnectionParams,
    query: &str,
    mut on_row: F,
) -> Result<(), String>
where
    F: FnMut(&[String], &[Value]) -> Result<(), String> + Send,
{
    const PAGE_SIZE: u32 = 1000;

    let driver = crate::drivers::registry::get_driver(driver_id)
        .await
        .ok_or_else(|| format!("Unsupported driver for export: {driver_id}"))?;

    let mut page: u32 = 1;
    loop {
        let result = driver
            .execute_query(params, query, Some(PAGE_SIZE), page, None)
            .await?;

        for row in &result.rows {
            on_row(&result.columns, row)?;
        }

        let fetched = result.rows.len() as u32;
        let has_more = result
            .pagination
            .as_ref()
            .map(|p| p.has_more)
            .unwrap_or(fetched >= PAGE_SIZE);

        if fetched == 0 || !has_more {
            break;
        }
        page += 1;
    }

    Ok(())
}
