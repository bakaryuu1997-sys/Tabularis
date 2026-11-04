use super::client::{format_pg_error, get_client, query_all};
use super::helpers::escape_identifier;
use crate::explain_import::parse_postgres_json;
use crate::models::{ConnectionParams, ExplainPlan, HypotheticalIndex, WhatIfExplainOutcome};
use crate::pool_manager::get_postgres_pool;
use tokio_postgres::Row as PgRow;

/// Upper bound on the number of columns in a single hypothetical index.
const MAX_HYPOTHETICAL_INDEX_COLUMNS: usize = 8;

/// Upper bound on the number of hypothetical indexes evaluated in one call.
const MAX_HYPOTHETICAL_INDEXES: usize = 16;

/// Reads the single-cell JSON result of `EXPLAIN (FORMAT JSON)` into an [`ExplainPlan`].
fn plan_from_rows(rows: &[PgRow], query: &str) -> Result<ExplainPlan, String> {
    if rows.is_empty() {
        return Err("EXPLAIN returned no output".into());
    }

    // `EXPLAIN (FORMAT JSON)` on real PostgreSQL returns a column of type
    // `json` (not `text`), so reading it as `String` fails with
    // "error deserializing column 0". Read it as a `serde_json::Value` and
    // re-serialize. Some Postgres-compatible engines hand back a plain `text`
    // column instead, so fall back to reading the raw string in that case.
    let plan_json_str = match rows[0].try_get::<_, serde_json::Value>(0) {
        Ok(value) => value.to_string(),
        Err(json_err) => rows[0].try_get::<_, String>(0).map_err(|e| {
            log::debug!("EXPLAIN json read failed ({json_err}); text read also failed");
            format_pg_error(&e)
        })?,
    };

    let mut plan = parse_postgres_json(&plan_json_str)?;
    plan.original_query = query.to_string();
    Ok(plan)
}

pub async fn explain_query(
    params: &ConnectionParams,
    query: &str,
    analyze: bool,
    schema: Option<&str>,
) -> Result<ExplainPlan, String> {
    let pool = get_postgres_pool(params).await?;

    if let Some(s) = schema {
        let search_path = format!("SET search_path TO \"{}\"", escape_identifier(s));
        query_all(&pool, &search_path, &[]).await?;
    }

    let explain_sql = if analyze {
        format!("EXPLAIN (FORMAT JSON, ANALYZE, BUFFERS) {}", query)
    } else {
        format!("EXPLAIN (FORMAT JSON) {}", query)
    };

    let rows = query_all(&pool, &explain_sql, &[]).await?;
    plan_from_rows(&rows, query)
}

/// Builds the `CREATE INDEX` statement handed to `hypopg_create_index`.
///
/// Identifiers are always quoted, so names containing quotes or spaces cannot
/// break out of the statement.
pub(crate) fn hypopg_index_ddl(
    schema: Option<&str>,
    index: &HypotheticalIndex,
) -> Result<String, String> {
    if index.table.trim().is_empty() {
        return Err("Hypothetical index needs a table name".into());
    }
    if index.columns.is_empty() {
        return Err("Hypothetical index needs at least one column".into());
    }
    if index.columns.len() > MAX_HYPOTHETICAL_INDEX_COLUMNS {
        return Err(format!(
            "Hypothetical index has too many columns (max {})",
            MAX_HYPOTHETICAL_INDEX_COLUMNS
        ));
    }
    if index.columns.iter().any(|c| c.trim().is_empty()) {
        return Err("Hypothetical index contains an empty column name".into());
    }

    let target = match schema {
        Some(s) if !s.trim().is_empty() => format!(
            "\"{}\".\"{}\"",
            escape_identifier(s),
            escape_identifier(&index.table)
        ),
        _ => format!("\"{}\"", escape_identifier(&index.table)),
    };
    let columns: Vec<String> = index
        .columns
        .iter()
        .map(|c| format!("\"{}\"", escape_identifier(c)))
        .collect();

    Ok(format!("CREATE INDEX ON {} ({})", target, columns.join(", ")))
}

/// Plans `query` with hypothetical indexes provided by the `hypopg` extension.
///
/// Nothing is built or locked on the server and the query is never executed:
/// the hypothetical indexes only exist in this backend's memory and are always
/// reset before the connection goes back to the pool. When `hypopg` is not
/// installed the caller gets `ExtensionMissing` rather than invented numbers.
pub async fn explain_with_hypothetical_indexes(
    params: &ConnectionParams,
    query: &str,
    indexes: &[HypotheticalIndex],
    schema: Option<&str>,
) -> Result<WhatIfExplainOutcome, String> {
    if indexes.is_empty() {
        return Err("At least one hypothetical index is required".into());
    }
    if indexes.len() > MAX_HYPOTHETICAL_INDEXES {
        return Err(format!(
            "Too many hypothetical indexes (max {})",
            MAX_HYPOTHETICAL_INDEXES
        ));
    }
    // Validate every statement up-front so we fail before touching the server.
    let ddl: Vec<String> = indexes
        .iter()
        .map(|i| hypopg_index_ddl(schema, i))
        .collect::<Result<_, _>>()?;

    let pool = get_postgres_pool(params).await?;
    // A single pooled connection must serve every statement: hypopg state is per-session.
    let client = get_client(&pool).await?;

    let installed = client
        .query_opt("SELECT 1 FROM pg_extension WHERE extname = 'hypopg'", &[])
        .await
        .map_err(|e| format_pg_error(&e))?
        .is_some();
    if !installed {
        return Ok(WhatIfExplainOutcome::ExtensionMissing {
            extension: "hypopg".into(),
        });
    }

    let outcome = async {
        if let Some(s) = schema {
            client
                .batch_execute(&format!("SET search_path TO \"{}\"", escape_identifier(s)))
                .await
                .map_err(|e| format_pg_error(&e))?;
        }
        for statement in &ddl {
            client
                .query("SELECT * FROM hypopg_create_index($1)", &[statement])
                .await
                .map_err(|e| format_pg_error(&e))?;
        }
        let rows = client
            .query(&format!("EXPLAIN (FORMAT JSON) {}", query), &[])
            .await
            .map_err(|e| format_pg_error(&e))?;
        plan_from_rows(&rows, query)
    }
    .await;

    // Always clean the session before it returns to the pool, even on error.
    if let Err(e) = client
        .batch_execute("SELECT hypopg_reset(); RESET search_path")
        .await
    {
        log::warn!("Failed to reset hypopg session state: {}", format_pg_error(&e));
    }

    outcome.map(|plan| WhatIfExplainOutcome::Plan { plan })
}
