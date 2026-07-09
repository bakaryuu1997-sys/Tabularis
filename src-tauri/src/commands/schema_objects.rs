//! Database schema-object commands: views, materialized views, and triggers.
//!
//! Extracted from the monolithic `commands` module. Each command resolves the
//! connection params (SSH/K8s expansion included) and delegates to the active
//! driver. Registered in `lib.rs` transparently via `pub use schema_objects::*`.

use tauri::{AppHandle, Runtime};

use crate::models::{TableColumn, TriggerInfo};

use super::{
    driver_for, expand_k8s_connection_params, expand_ssh_connection_params,
    find_connection_by_id, resolve_connection_params_with_id,
};

#[tauri::command]
pub async fn get_views<R: Runtime>(
    app: AppHandle<R>,
    connection_id: String,
    schema: Option<String>,
) -> Result<Vec<crate::models::ViewInfo>, String> {
    log::info!("Fetching views for connection: {}", connection_id);

    let saved_conn = find_connection_by_id(&app, &connection_id)?;
    let expanded_params = expand_ssh_connection_params(&app, &saved_conn.params).await?;
    let expanded_params = expand_k8s_connection_params(&app, &expanded_params).await?;
    let params = resolve_connection_params_with_id(&expanded_params, &connection_id)?;

    log::debug!(
        "Getting views from {} database: {}",
        saved_conn.params.driver,
        params.database
    );

    let drv = driver_for(&saved_conn.params.driver).await?;
    let result = drv.get_views(&params, schema.as_deref()).await;

    match &result {
        Ok(views) => log::info!("Retrieved {} views from {}", views.len(), params.database),
        Err(e) => log::error!("Failed to get views from {}: {}", params.database, e),
    }

    result
}

#[tauri::command]
pub async fn get_view_definition<R: Runtime>(
    app: AppHandle<R>,
    connection_id: String,
    view_name: String,
    schema: Option<String>,
) -> Result<String, String> {
    log::info!(
        "Fetching view definition for: {} on connection: {}",
        view_name,
        connection_id
    );

    let saved_conn = find_connection_by_id(&app, &connection_id)?;
    let expanded_params = expand_ssh_connection_params(&app, &saved_conn.params).await?;
    let expanded_params = expand_k8s_connection_params(&app, &expanded_params).await?;
    let params = resolve_connection_params_with_id(&expanded_params, &connection_id)?;

    let drv = driver_for(&saved_conn.params.driver).await?;
    let result = drv
        .get_view_definition(&params, &view_name, schema.as_deref())
        .await;

    match &result {
        Ok(_) => log::info!("Successfully retrieved view definition for {}", view_name),
        Err(e) => log::error!("Failed to get view definition for {}: {}", view_name, e),
    }

    result
}

#[tauri::command]
pub async fn create_view<R: Runtime>(
    app: AppHandle<R>,
    connection_id: String,
    view_name: String,
    definition: String,
    schema: Option<String>,
) -> Result<(), String> {
    log::info!(
        "Creating view: {} on connection: {}",
        view_name,
        connection_id
    );

    let saved_conn = find_connection_by_id(&app, &connection_id)?;
    let expanded_params = expand_ssh_connection_params(&app, &saved_conn.params).await?;
    let expanded_params = expand_k8s_connection_params(&app, &expanded_params).await?;
    let params = resolve_connection_params_with_id(&expanded_params, &connection_id)?;

    let drv = driver_for(&saved_conn.params.driver).await?;
    let result = drv
        .create_view(&params, &view_name, &definition, schema.as_deref())
        .await;

    match &result {
        Ok(_) => log::info!("Successfully created view: {}", view_name),
        Err(e) => log::error!("Failed to create view {}: {}", view_name, e),
    }

    result
}

#[tauri::command]
pub async fn alter_view<R: Runtime>(
    app: AppHandle<R>,
    connection_id: String,
    view_name: String,
    definition: String,
    schema: Option<String>,
) -> Result<(), String> {
    log::info!(
        "Altering view: {} on connection: {}",
        view_name,
        connection_id
    );

    let saved_conn = find_connection_by_id(&app, &connection_id)?;
    let expanded_params = expand_ssh_connection_params(&app, &saved_conn.params).await?;
    let expanded_params = expand_k8s_connection_params(&app, &expanded_params).await?;
    let params = resolve_connection_params_with_id(&expanded_params, &connection_id)?;

    let drv = driver_for(&saved_conn.params.driver).await?;
    let result = drv
        .alter_view(&params, &view_name, &definition, schema.as_deref())
        .await;

    match &result {
        Ok(_) => log::info!("Successfully altered view: {}", view_name),
        Err(e) => log::error!("Failed to alter view {}: {}", view_name, e),
    }

    result
}

#[tauri::command]
pub async fn drop_view<R: Runtime>(
    app: AppHandle<R>,
    connection_id: String,
    view_name: String,
    schema: Option<String>,
) -> Result<(), String> {
    log::info!(
        "Dropping view: {} on connection: {}",
        view_name,
        connection_id
    );

    let saved_conn = find_connection_by_id(&app, &connection_id)?;
    let expanded_params = expand_ssh_connection_params(&app, &saved_conn.params).await?;
    let expanded_params = expand_k8s_connection_params(&app, &expanded_params).await?;
    let params = resolve_connection_params_with_id(&expanded_params, &connection_id)?;

    let drv = driver_for(&saved_conn.params.driver).await?;
    let result = drv.drop_view(&params, &view_name, schema.as_deref()).await;

    match &result {
        Ok(_) => log::info!("Successfully dropped view: {}", view_name),
        Err(e) => log::error!("Failed to drop view {}: {}", view_name, e),
    }

    result
}

#[tauri::command]
pub async fn get_view_columns<R: Runtime>(
    app: AppHandle<R>,
    connection_id: String,
    view_name: String,
    schema: Option<String>,
) -> Result<Vec<TableColumn>, String> {
    log::info!(
        "Fetching view columns for: {} on connection: {}",
        view_name,
        connection_id
    );

    let saved_conn = find_connection_by_id(&app, &connection_id)?;
    let expanded_params = expand_ssh_connection_params(&app, &saved_conn.params).await?;
    let expanded_params = expand_k8s_connection_params(&app, &expanded_params).await?;
    let params = resolve_connection_params_with_id(&expanded_params, &connection_id)?;

    let drv = driver_for(&saved_conn.params.driver).await?;
    let result = drv
        .get_view_columns(&params, &view_name, schema.as_deref())
        .await;

    match &result {
        Ok(columns) => log::info!("Retrieved {} columns for view {}", columns.len(), view_name),
        Err(e) => log::error!("Failed to get view columns for {}: {}", view_name, e),
    }

    result
}

#[tauri::command]
pub async fn get_materialized_views<R: Runtime>(
    app: AppHandle<R>,
    connection_id: String,
    schema: Option<String>,
) -> Result<Vec<crate::models::ViewInfo>, String> {
    log::info!("Fetching materialized views for connection: {}", connection_id);

    let saved_conn = find_connection_by_id(&app, &connection_id)?;
    let expanded_params = expand_ssh_connection_params(&app, &saved_conn.params).await?;
    let expanded_params = expand_k8s_connection_params(&app, &expanded_params).await?;
    let params = resolve_connection_params_with_id(&expanded_params, &connection_id)?;

    let drv = driver_for(&saved_conn.params.driver).await?;
    let result = drv.get_materialized_views(&params, schema.as_deref()).await;

    match &result {
        Ok(views) => log::info!(
            "Retrieved {} materialized views from {}",
            views.len(),
            params.database
        ),
        Err(e) => log::error!(
            "Failed to get materialized views from {}: {}",
            params.database,
            e
        ),
    }

    result
}

#[tauri::command]
pub async fn get_materialized_view_columns<R: Runtime>(
    app: AppHandle<R>,
    connection_id: String,
    view_name: String,
    schema: Option<String>,
) -> Result<Vec<TableColumn>, String> {
    log::info!(
        "Fetching materialized view columns for: {} on connection: {}",
        view_name,
        connection_id
    );

    let saved_conn = find_connection_by_id(&app, &connection_id)?;
    let expanded_params = expand_ssh_connection_params(&app, &saved_conn.params).await?;
    let expanded_params = expand_k8s_connection_params(&app, &expanded_params).await?;
    let params = resolve_connection_params_with_id(&expanded_params, &connection_id)?;

    let drv = driver_for(&saved_conn.params.driver).await?;
    let result = drv
        .get_materialized_view_columns(&params, &view_name, schema.as_deref())
        .await;

    match &result {
        Ok(columns) => log::info!(
            "Retrieved {} columns for materialized view {}",
            columns.len(),
            view_name
        ),
        Err(e) => log::error!(
            "Failed to get materialized view columns for {}: {}",
            view_name,
            e
        ),
    }

    result
}

#[tauri::command]
pub async fn get_materialized_view_definition<R: Runtime>(
    app: AppHandle<R>,
    connection_id: String,
    view_name: String,
    schema: Option<String>,
) -> Result<String, String> {
    log::info!(
        "Fetching materialized view definition for: {} on connection: {}",
        view_name,
        connection_id
    );

    let saved_conn = find_connection_by_id(&app, &connection_id)?;
    let expanded_params = expand_ssh_connection_params(&app, &saved_conn.params).await?;
    let expanded_params = expand_k8s_connection_params(&app, &expanded_params).await?;
    let params = resolve_connection_params_with_id(&expanded_params, &connection_id)?;

    let drv = driver_for(&saved_conn.params.driver).await?;
    let result = drv
        .get_materialized_view_definition(&params, &view_name, schema.as_deref())
        .await;

    match &result {
        Ok(_) => log::info!(
            "Successfully retrieved materialized view definition for {}",
            view_name
        ),
        Err(e) => log::error!(
            "Failed to get materialized view definition for {}: {}",
            view_name,
            e
        ),
    }

    result
}

#[tauri::command]
pub async fn refresh_materialized_view<R: Runtime>(
    app: AppHandle<R>,
    connection_id: String,
    view_name: String,
    schema: Option<String>,
) -> Result<(), String> {
    log::info!(
        "Refreshing materialized view: {} on connection: {}",
        view_name,
        connection_id
    );

    let saved_conn = find_connection_by_id(&app, &connection_id)?;
    let expanded_params = expand_ssh_connection_params(&app, &saved_conn.params).await?;
    let expanded_params = expand_k8s_connection_params(&app, &expanded_params).await?;
    let params = resolve_connection_params_with_id(&expanded_params, &connection_id)?;

    let drv = driver_for(&saved_conn.params.driver).await?;
    let result = drv
        .refresh_materialized_view(&params, &view_name, schema.as_deref())
        .await;

    match &result {
        Ok(_) => log::info!("Successfully refreshed materialized view: {}", view_name),
        Err(e) => log::error!("Failed to refresh materialized view {}: {}", view_name, e),
    }

    result
}

#[tauri::command]
pub async fn get_triggers<R: Runtime>(
    app: AppHandle<R>,
    connection_id: String,
    schema: Option<String>,
) -> Result<Vec<TriggerInfo>, String> {
    log::info!("Fetching triggers for connection: {}", connection_id);

    let saved_conn = find_connection_by_id(&app, &connection_id)?;
    let expanded_params = expand_ssh_connection_params(&app, &saved_conn.params).await?;
    let expanded_params = expand_k8s_connection_params(&app, &expanded_params).await?;
    let params = resolve_connection_params_with_id(&expanded_params, &connection_id)?;

    let drv = driver_for(&saved_conn.params.driver).await?;
    let result = drv.get_triggers(&params, schema.as_deref()).await;

    match &result {
        Ok(triggers) => log::info!("Retrieved {} triggers", triggers.len()),
        Err(e) => log::error!("Failed to get triggers: {}", e),
    }

    result
}

#[tauri::command]
pub async fn get_trigger_definition<R: Runtime>(
    app: AppHandle<R>,
    connection_id: String,
    trigger_name: String,
    table_name: String,
    schema: Option<String>,
) -> Result<String, String> {
    log::info!(
        "Fetching trigger definition for: {} on connection: {}",
        trigger_name,
        connection_id
    );

    let saved_conn = find_connection_by_id(&app, &connection_id)?;
    let expanded_params = expand_ssh_connection_params(&app, &saved_conn.params).await?;
    let expanded_params = expand_k8s_connection_params(&app, &expanded_params).await?;
    let params = resolve_connection_params_with_id(&expanded_params, &connection_id)?;

    let drv = driver_for(&saved_conn.params.driver).await?;
    drv.get_trigger_definition(&params, &trigger_name, &table_name, schema.as_deref())
        .await
}

#[tauri::command]
pub async fn create_trigger<R: Runtime>(
    app: AppHandle<R>,
    connection_id: String,
    trigger_sql: String,
    schema: Option<String>,
) -> Result<(), String> {
    log::info!("Creating trigger on connection: {}", connection_id);

    let saved_conn = find_connection_by_id(&app, &connection_id)?;
    let expanded_params = expand_ssh_connection_params(&app, &saved_conn.params).await?;
    let expanded_params = expand_k8s_connection_params(&app, &expanded_params).await?;
    let params = resolve_connection_params_with_id(&expanded_params, &connection_id)?;

    let drv = driver_for(&saved_conn.params.driver).await?;
    let result = drv
        .create_trigger(&params, &trigger_sql, schema.as_deref())
        .await;

    match &result {
        Ok(_) => log::info!("Successfully created trigger"),
        Err(e) => log::error!("Failed to create trigger: {}", e),
    }

    result
}

#[tauri::command]
pub async fn drop_trigger<R: Runtime>(
    app: AppHandle<R>,
    connection_id: String,
    trigger_name: String,
    table_name: String,
    schema: Option<String>,
) -> Result<(), String> {
    log::info!(
        "Dropping trigger: {} on connection: {}",
        trigger_name,
        connection_id
    );

    let saved_conn = find_connection_by_id(&app, &connection_id)?;
    let expanded_params = expand_ssh_connection_params(&app, &saved_conn.params).await?;
    let expanded_params = expand_k8s_connection_params(&app, &expanded_params).await?;
    let params = resolve_connection_params_with_id(&expanded_params, &connection_id)?;

    let drv = driver_for(&saved_conn.params.driver).await?;
    let result = drv
        .drop_trigger(&params, &trigger_name, &table_name, schema.as_deref())
        .await;

    match &result {
        Ok(_) => log::info!("Successfully dropped trigger: {}", trigger_name),
        Err(e) => log::error!("Failed to drop trigger {}: {}", trigger_name, e),
    }

    result
}
