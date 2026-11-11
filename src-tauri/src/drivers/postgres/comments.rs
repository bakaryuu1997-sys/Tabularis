//! Table and column comments (`COMMENT ON ...`) of a PostgreSQL schema.

use super::client::query_all;
use crate::models::{ConnectionParams, SchemaComments};
use crate::pool_manager::get_postgres_pool;

/// One query for every comment in the schema: table comments (`objsubid = 0`) and column comments
/// (`objsubid` = column number) of tables, partitioned tables, views, materialized views and foreign tables.
const COMMENTS_QUERY: &str = r#"
    SELECT c.relname::text AS table_name,
           NULL::text      AS column_name,
           d.description::text AS description
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_catalog.pg_description d
         ON d.objoid = c.oid AND d.classoid = 'pg_catalog.pg_class'::regclass AND d.objsubid = 0
    WHERE n.nspname = $1 AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
    UNION ALL
    SELECT c.relname::text,
           a.attname::text,
           d.description::text
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_catalog.pg_attribute a
         ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
    JOIN pg_catalog.pg_description d
         ON d.objoid = c.oid AND d.classoid = 'pg_catalog.pg_class'::regclass AND d.objsubid = a.attnum
    WHERE n.nspname = $1 AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
"#;

pub async fn get_schema_comments(params: &ConnectionParams, schema: &str) -> Result<SchemaComments, String> {
    let pool = get_postgres_pool(params).await?;
    let rows = query_all(&pool, COMMENTS_QUERY, &[&schema]).await?;

    let mut comments = SchemaComments::default();
    for row in &rows {
        let table: String = row.try_get("table_name").unwrap_or_default();
        let column: Option<String> = row.try_get("column_name").unwrap_or(None);
        let description: String = row.try_get("description").unwrap_or_default();
        comments.add_row(&table, column.as_deref(), &description);
    }
    Ok(comments)
}
