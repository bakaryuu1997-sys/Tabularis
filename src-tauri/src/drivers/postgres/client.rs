use deadpool_postgres::{Object as PgObject, Pool as PgPool};
use tokio_postgres::Row as PgRow;

pub(super) fn format_pg_error(e: &tokio_postgres::Error) -> String {
    let Some(db) = e.as_db_error() else {
        return e.to_string();
    };

    // Headline shown in the UI (everything before the first blank line).
    let brief = format!("{}: {}", db.severity(), db.message());

    // Readable, labelled details instead of a raw Rust `{:#?}` dump. Only the
    // fields PostgreSQL actually returned are included, so the panel stays short.
    let mut details: Vec<String> = Vec::new();
    if let Some(detail) = db.detail() {
        details.push(format!("Detail: {}", detail));
    }
    if let Some(hint) = db.hint() {
        details.push(format!("Hint: {}", hint));
    }
    if let Some(pos) = db.position() {
        match pos {
            tokio_postgres::error::ErrorPosition::Original(p) => {
                details.push(format!("Position: character {}", p));
            }
            tokio_postgres::error::ErrorPosition::Internal { position, query } => {
                details.push(format!(
                    "Position: character {} in internal query: {}",
                    position, query
                ));
            }
        }
    }
    // Object context — useful for constraint / not-null / FK violations.
    let mut ctx: Vec<String> = Vec::new();
    if let Some(t) = db.table() {
        ctx.push(format!("table \"{}\"", t));
    }
    if let Some(c) = db.column() {
        ctx.push(format!("column \"{}\"", c));
    }
    if let Some(c) = db.constraint() {
        ctx.push(format!("constraint \"{}\"", c));
    }
    if !ctx.is_empty() {
        details.push(format!("At: {}", ctx.join(", ")));
    }
    details.push(format!("SQLSTATE: {}", db.code().code()));

    format!("{}\n\n{}", brief, details.join("\n"))
}

#[inline(always)]
fn map_pg_err<E: std::fmt::Display>(e: E) -> String {
    // Connection/pool errors have no structured DB fields; their Display message
    // (e.g. "connection closed", "timed out") is the clearest thing to show.
    e.to_string()
}

#[inline(always)]
pub(super) async fn get_client(pool: &PgPool) -> Result<PgObject, String> {
    pool.get().await.map_err(map_pg_err)
}

#[inline]
pub(super) async fn query_all(
    pool: &PgPool,
    sql: &str,
    params: &[&(dyn tokio_postgres::types::ToSql + Sync)],
) -> Result<Vec<PgRow>, String> {
    let client = get_client(pool).await?;
    client
        .query(sql, params)
        .await
        .map_err(|e| format_pg_error(&e))
}

#[inline]
pub(super) async fn query_one(
    pool: &PgPool,
    sql: &str,
    params: &[&(dyn tokio_postgres::types::ToSql + Sync)],
) -> Result<PgRow, String> {
    let client = get_client(pool).await?;
    client
        .query_one(sql, params)
        .await
        .map_err(|e| format_pg_error(&e))
}

#[inline]
pub(super) async fn execute(
    pool: &PgPool,
    sql: &str,
    params: &[&(dyn tokio_postgres::types::ToSql + Sync)],
) -> Result<u64, String> {
    let client = get_client(pool).await?;
    client
        .execute(sql, params)
        .await
        .map_err(|e| format_pg_error(&e))
}

/// Like [`execute`], but pins every placeholder's wire type via `prepare_typed`
/// instead of letting the server infer it from query context.
///
/// Inference breaks for a `CAST($N AS uuid)` / `CAST($N AS timestamptz)`-style
/// placeholder: PostgreSQL resolves the parameter's *effective* type to the
/// cast's target for the client-side `Describe` response, so a bound `String`
/// is rejected before it ever reaches PostgreSQL's own text-to-uuid/temporal
/// parsing (#392, #401). Declaring the placeholder's type explicitly (e.g.
/// `TEXT`) sidesteps that client-side check and lets the `CAST` perform the
/// real conversion server-side, exactly like a literal in plain SQL.
#[inline]
pub(super) async fn execute_typed(
    pool: &PgPool,
    sql: &str,
    params: &[(&(dyn tokio_postgres::types::ToSql + Sync), tokio_postgres::types::Type)],
) -> Result<u64, String> {
    let client = get_client(pool).await?;
    let types: Vec<tokio_postgres::types::Type> = params.iter().map(|(_, t)| t.clone()).collect();
    let stmt = client
        .prepare_typed(sql, &types)
        .await
        .map_err(|e| format_pg_error(&e))?;
    let values: Vec<&(dyn tokio_postgres::types::ToSql + Sync)> =
        params.iter().map(|(v, _)| *v).collect();
    client
        .execute(&stmt, &values)
        .await
        .map_err(|e| format_pg_error(&e))
}

/// Like [`query_one`], but pins placeholder types via `prepare_typed`. See
/// [`execute_typed`] for why this matters.
#[inline]
pub(super) async fn query_one_typed(
    pool: &PgPool,
    sql: &str,
    params: &[(&(dyn tokio_postgres::types::ToSql + Sync), tokio_postgres::types::Type)],
) -> Result<PgRow, String> {
    let client = get_client(pool).await?;
    let types: Vec<tokio_postgres::types::Type> = params.iter().map(|(_, t)| t.clone()).collect();
    let stmt = client
        .prepare_typed(sql, &types)
        .await
        .map_err(|e| format_pg_error(&e))?;
    let values: Vec<&(dyn tokio_postgres::types::ToSql + Sync)> =
        params.iter().map(|(v, _)| *v).collect();
    client
        .query_one(&stmt, &values)
        .await
        .map_err(|e| format_pg_error(&e))
}
