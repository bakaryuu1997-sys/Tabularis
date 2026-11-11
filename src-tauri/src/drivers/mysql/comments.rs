//! Table and column comments of a MySQL / MariaDB database.

use super::{fetch_all_rows, get_mysql_pool, mysql_row_str, mysql_row_str_opt, resolve_text_proto};
use crate::models::{ConnectionParams, SchemaComments};

/// Table comments of base tables (views always report the text `VIEW`) followed by the non-empty column comments.
const COMMENTS_QUERY: &str = r#"
    SELECT TABLE_NAME AS table_name, NULL AS column_name, TABLE_COMMENT AS comment
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE' AND TABLE_COMMENT <> ''
    UNION ALL
    SELECT TABLE_NAME, COLUMN_NAME, COLUMN_COMMENT
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = ? AND COLUMN_COMMENT <> ''
"#;

pub async fn get_schema_comments(params: &ConnectionParams, schema: Option<&str>) -> Result<SchemaComments, String> {
    let db_name = schema.unwrap_or_else(|| params.database.primary());
    let pool = get_mysql_pool(params).await?;
    let text = resolve_text_proto(&pool, params).await?;

    let rows = fetch_all_rows(&pool, text, COMMENTS_QUERY, &[db_name, db_name]).await?;

    let mut comments = SchemaComments::default();
    for row in &rows {
        let table = mysql_row_str(row, 0);
        let column = mysql_row_str_opt(row, 1);
        let comment = mysql_row_str(row, 2);
        comments.add_row(&table, column.as_deref(), &comment);
    }
    Ok(comments)
}
