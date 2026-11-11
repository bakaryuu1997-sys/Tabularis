use std::collections::HashMap;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum DatabaseSelection {
    Single(String),
    Multiple(Vec<String>),
}

impl DatabaseSelection {
    pub fn primary(&self) -> &str {
        match self {
            DatabaseSelection::Single(s) => s.as_str(),
            DatabaseSelection::Multiple(v) => v.first().map(|s| s.as_str()).unwrap_or(""),
        }
    }

    pub fn as_vec(&self) -> Vec<String> {
        match self {
            DatabaseSelection::Single(s) => {
                if s.is_empty() {
                    vec![]
                } else {
                    vec![s.clone()]
                }
            }
            DatabaseSelection::Multiple(v) => v.clone(),
        }
    }

    pub fn is_multi(&self) -> bool {
        matches!(self, DatabaseSelection::Multiple(v) if v.len() > 1)
    }
}

/// If `previous` was single-db (zero/one effective database) and `new` is multi-db
/// (two or more), return the previous single database name so callers can backfill
/// existing per-connection records (favorites, query history) that had no explicit
/// database set. Returns `None` when this is not a single→multi transition or when
/// the previous selection had no usable name.
pub fn single_db_before_multi_transition(
    previous: &DatabaseSelection,
    new: &DatabaseSelection,
) -> Option<String> {
    if previous.is_multi() || !new.is_multi() {
        return None;
    }
    previous
        .as_vec()
        .into_iter()
        .find(|s| !s.trim().is_empty())
}

impl std::fmt::Display for DatabaseSelection {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.primary())
    }
}

impl Default for DatabaseSelection {
    fn default() -> Self {
        DatabaseSelection::Single(String::new())
    }
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct SshConnection {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub user: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auth_type: Option<String>, // "password" or "ssh_key"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub password: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub key_file: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub key_passphrase: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub allow_passphrase_prompt: Option<bool>,
    pub save_in_keychain: Option<bool>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct SshConnectionInput {
    pub host: String,
    pub port: u16,
    pub user: String,
    pub auth_type: String, // "password" or "ssh_key"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub password: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub key_file: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub key_passphrase: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub allow_passphrase_prompt: Option<bool>,
    pub save_in_keychain: Option<bool>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct SshTestParams {
    pub host: String,
    pub port: u16,
    pub user: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub password: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub key_file: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub key_passphrase: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub allow_passphrase_prompt: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub connection_id: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, Clone, Default)]
pub struct ConnectionParams {
    pub driver: String,
    pub host: Option<String>,
    pub port: Option<u16>,
    pub username: Option<String>,
    pub password: Option<String>,
    pub database: DatabaseSelection,
    pub ssl_mode: Option<String>,
    pub ssl_ca: Option<String>,
    pub ssl_cert: Option<String>,
    pub ssl_key: Option<String>,
    // MySQL/MariaDB: enable the mysql_clear_password (cleartext) auth plugin.
    // Required by bastions like Warpgate. Only honoured over a TLS connection.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub enable_cleartext_plugin: Option<bool>,
    // MySQL: whether sqlx should force the PIPES_AS_CONCAT / NO_ENGINE_SUBSTITUTION
    // sql_mode on connect. Defaults to `true` (sqlx's behavior) when unset.
    // Set to `false` for servers that reject altering sql_mode, e.g. Vitess/PlanetScale.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pipes_as_concat: Option<bool>,
    // SSH Tunnel
    pub ssh_enabled: Option<bool>,
    pub ssh_connection_id: Option<String>,
    // Legacy SSH fields (for backward compatibility during migration)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ssh_host: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ssh_port: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ssh_user: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ssh_password: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ssh_key_file: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ssh_key_passphrase: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ssh_allow_passphrase_prompt: Option<bool>,
    pub save_in_keychain: Option<bool>,
    // Kubernetes Tunnel (mutually exclusive with SSH)
    #[serde(default)]
    pub k8s_enabled: Option<bool>,
    #[serde(default)]
    pub k8s_connection_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub k8s_context: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub k8s_namespace: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub k8s_resource_type: Option<String>, // "service" or "pod"
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub k8s_resource_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub k8s_port: Option<u16>,
    /// SQL run on every new physical connection in the pool (e.g. `SET` /
    /// `set_config` for session-scoped settings such as bypassing RLS).
    /// Statements are separated by `;`. Runs per pooled connection so the
    /// setting applies to every query regardless of which connection the
    /// pool hands out.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub startup_script: Option<String>,
    // Connection ID for stable pooling (not persisted, set at runtime)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub connection_id: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum IconOverride {
    Pack { id: String },
    Emoji { value: String },
    Image { path: String },
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionAppearance {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon: Option<IconOverride>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub accent_color: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub environment: Option<String>,
    /// Safe Mode level chosen in the UI ("silent" | "alert" | "strict" | "readonly").
    /// Must be declared here, otherwise serde drops it when the connection is saved.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub safe_mode: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct SavedConnection {
    pub id: String,
    pub name: String,
    pub params: ConnectionParams,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub group_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sort_order: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detect_json_in_text_columns: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub environment: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub appearance: Option<ConnectionAppearance>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct ConnectionGroup {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub collapsed: bool,
    #[serde(default)]
    pub sort_order: i32,
}

#[derive(Debug, Deserialize, Serialize, Clone, Default)]
pub struct ConnectionsFile {
    #[serde(default)]
    pub groups: Vec<ConnectionGroup>,
    #[serde(default)]
    pub connections: Vec<SavedConnection>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct K8sConnection {
    pub id: String,
    pub name: String,
    pub context: String,
    pub namespace: String,
    pub resource_type: String, // "service" or "pod"
    pub resource_name: String,
    pub port: u16,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct K8sConnectionInput {
    pub name: String,
    pub context: String,
    pub namespace: String,
    pub resource_type: String,
    pub resource_name: String,
    pub port: u16,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct K8sTestParams {
    pub context: String,
    pub namespace: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resource_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resource_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub port: Option<u16>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct ExportPayload {
    pub version: i32,
    pub groups: Vec<ConnectionGroup>,
    pub connections: Vec<SavedConnection>,
    pub ssh_connections: Vec<SshConnection>,
    #[serde(default)]
    pub k8s_connections: Vec<K8sConnection>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct TestConnectionRequest {
    pub params: ConnectionParams,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub connection_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TableInfo {
    pub name: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TableColumn {
    pub name: String,
    pub data_type: String,
    pub is_pk: bool,
    pub is_nullable: bool,
    pub is_auto_increment: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_value: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub character_maximum_length: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ForeignKey {
    pub name: String,
    pub column_name: String,
    pub ref_table: String,
    pub ref_column: String,
    pub on_delete: Option<String>,
    pub on_update: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Index {
    pub name: String,
    pub column_name: String,
    pub is_unique: bool,
    pub is_primary: bool,
    pub seq_in_index: i32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Pagination {
    pub page: u32,
    pub page_size: u32,
    pub total_rows: Option<u64>,
    pub has_more: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct QueryResult {
    pub columns: Vec<String>,
    pub rows: Vec<Vec<serde_json::Value>>,
    pub affected_rows: u64,
    #[serde(default)]
    pub truncated: bool,
    pub pagination: Option<Pagination>,
}

/// One statement's outcome within an `execute_batch` call. Exactly one of
/// `result` / `error` is `Some` — kept as separate optionals (not a tagged
/// enum) so the TypeScript side can do `if (item.error) ... else ... item.result`
/// without a discriminated-union helper. Use [`BatchStatementResult::from_outcome`]
/// to construct so the invariant is enforced.
///
/// `execution_time_ms` is measured server-side because a batch is one
/// Tauri round-trip but the history UI wants per-statement timings.
#[derive(Debug, Serialize, Deserialize)]
pub struct BatchStatementResult {
    pub result: Option<QueryResult>,
    pub error: Option<String>,
    pub execution_time_ms: Option<f64>,
}

impl BatchStatementResult {
    /// Builds a result from a started `Instant` and the outcome of executing
    /// one statement. Centralises the `Ok` / `Err` -> struct mapping that
    /// would otherwise be duplicated across every driver's `execute_batch`
    /// and the trait default.
    pub fn from_outcome(start: std::time::Instant, outcome: Result<QueryResult, String>) -> Self {
        let execution_time_ms = Some(start.elapsed().as_secs_f64() * 1000.0);
        match outcome {
            Ok(r) => Self {
                result: Some(r),
                error: None,
                execution_time_ms,
            },
            Err(e) => Self {
                result: None,
                error: Some(e),
                execution_time_ms,
            },
        }
    }
}

/// A single node in a query execution plan tree.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ExplainNode {
    pub id: String,
    pub node_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub relation: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub startup_cost: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total_cost: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub plan_rows: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub actual_rows: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub actual_time_ms: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub actual_loops: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub buffers_hit: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub buffers_read: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub filter: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub index_condition: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub join_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hash_condition: Option<String>,
    #[serde(default)]
    pub extra: HashMap<String, serde_json::Value>,
    #[serde(default)]
    pub children: Vec<ExplainNode>,
}

/// An index that does not exist yet, used to ask the planner "what if this index existed?".
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HypotheticalIndex {
    pub table: String,
    pub columns: Vec<String>,
}

/// Result of a what-if EXPLAIN. The frontend never needs to know which driver
/// produced it: unsupported drivers and missing server extensions are reported
/// as plain statuses instead of fabricated numbers.
#[derive(Debug, Serialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum WhatIfExplainOutcome {
    /// The driver cannot evaluate hypothetical indexes.
    Unsupported,
    /// The driver can, but a required server-side extension is not installed.
    ExtensionMissing { extension: String },
    /// The plan the planner chose with the hypothetical indexes in place.
    Plan { plan: ExplainPlan },
}

/// The complete result of an EXPLAIN query, including the plan tree and metadata.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ExplainPlan {
    pub root: ExplainNode,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub planning_time_ms: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub execution_time_ms: Option<f64>,
    pub original_query: String,
    pub driver: String,
    pub has_analyze_data: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub raw_output: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TableSchema {
    pub name: String,
    pub columns: Vec<TableColumn>,
    pub foreign_keys: Vec<ForeignKey>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RoutineInfo {
    pub name: String,
    pub routine_type: String, // "PROCEDURE" | "FUNCTION"
    pub definition: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RoutineParameter {
    pub name: String,
    pub data_type: String,
    pub mode: String, // "IN", "OUT", "INOUT"
    pub ordinal_position: i32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ViewInfo {
    pub name: String,
    pub definition: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TriggerInfo {
    pub name: String,
    pub table_name: String,
    pub event: String,   // e.g. "INSERT", "UPDATE", "DELETE", "INSERT OR UPDATE"
    pub timing: String,  // "BEFORE", "AFTER", "INSTEAD OF"
    pub definition: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ColumnDefinition {
    pub name: String,
    pub data_type: String,
    pub is_nullable: bool,
    pub is_pk: bool,
    pub is_auto_increment: bool,
    pub default_value: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DataTypeInfo {
    pub name: String,
    pub category: String,
    pub requires_length: bool,
    pub requires_precision: bool,
    pub default_length: Option<String>,
    #[serde(default)]
    pub supports_auto_increment: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub requires_extension: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DataTypeRegistry {
    pub driver: String,
    pub types: Vec<DataTypeInfo>,
}

#[cfg(test)]
mod appearance_tests {
    use super::*;

    #[test]
    fn icon_override_pack_roundtrip() {
        let v = IconOverride::Pack { id: "server".into() };
        let s = serde_json::to_string(&v).unwrap();
        assert_eq!(s, r#"{"type":"pack","id":"server"}"#);
        let back: IconOverride = serde_json::from_str(&s).unwrap();
        assert!(matches!(back, IconOverride::Pack { id } if id == "server"));
    }

    #[test]
    fn icon_override_emoji_roundtrip() {
        let v = IconOverride::Emoji { value: "🐘".into() };
        let s = serde_json::to_string(&v).unwrap();
        assert_eq!(s, r#"{"type":"emoji","value":"🐘"}"#);
        let back: IconOverride = serde_json::from_str(&s).unwrap();
        assert!(matches!(back, IconOverride::Emoji { value } if value == "🐘"));
    }

    #[test]
    fn icon_override_image_roundtrip() {
        let v = IconOverride::Image { path: "connection-icons/abc.png".into() };
        let s = serde_json::to_string(&v).unwrap();
        assert_eq!(s, r#"{"type":"image","path":"connection-icons/abc.png"}"#);
        let back: IconOverride = serde_json::from_str(&s).unwrap();
        assert!(matches!(back, IconOverride::Image { path } if path == "connection-icons/abc.png"));
    }

    #[test]
    fn saved_connection_without_appearance_deserializes() {
        let s = r#"{"id":"1","name":"x","params":{"driver":"mysql","database":""}}"#;
        let c: SavedConnection = serde_json::from_str(s).unwrap();
        assert!(c.appearance.is_none());
    }

    #[test]
    fn connection_appearance_with_only_color_serializes_compactly() {
        let a = ConnectionAppearance { icon: None, accent_color: Some("#ff0000".into()), environment: None, safe_mode: None };
        let s = serde_json::to_string(&a).unwrap();
        assert_eq!(s, r##"{"accentColor":"#ff0000"}"##);
    }
}

#[cfg(test)]
mod connection_appearance_safe_mode_tests {
    use super::ConnectionAppearance;

    #[test]
    fn safe_mode_survives_a_serde_round_trip() {
        let parsed: ConnectionAppearance =
            serde_json::from_str(r#"{"environment":"production","safeMode":"strict"}"#).unwrap();
        assert_eq!(parsed.safe_mode.as_deref(), Some("strict"));
        let json = serde_json::to_string(&parsed).unwrap();
        assert!(json.contains(r#""safeMode":"strict""#));
    }

    #[test]
    fn missing_safe_mode_is_omitted_when_serializing() {
        let json = serde_json::to_string(&ConnectionAppearance::default()).unwrap();
        assert_eq!(json, "{}");
    }
}

/// Comments stored in the database for the tables and columns of one schema.
///
/// Teams keep the "logical name" of a table or column here (for example `顧客名 / Tên khách hàng`), which the
/// table-definition document exports. Drivers without comments return the default (empty) value.
#[derive(Debug, Default, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SchemaComments {
    /// Table name -> table comment.
    pub tables: HashMap<String, String>,
    /// Table name -> column name -> column comment.
    pub columns: HashMap<String, HashMap<String, String>>,
}

impl SchemaComments {
    /// Records a table comment. Blank comments are ignored, so "no comment" and "empty comment" look the same.
    pub fn add_table(&mut self, table: &str, comment: &str) {
        let comment = comment.trim();
        if !comment.is_empty() {
            self.tables.insert(table.to_string(), comment.to_string());
        }
    }

    /// Records a column comment. Blank comments are ignored.
    pub fn add_column(&mut self, table: &str, column: &str, comment: &str) {
        let comment = comment.trim();
        if !comment.is_empty() {
            self.columns
                .entry(table.to_string())
                .or_default()
                .insert(column.to_string(), comment.to_string());
        }
    }

    /// Adds one row of a combined result where `column` is `None` for the table's own comment.
    pub fn add_row(&mut self, table: &str, column: Option<&str>, comment: &str) {
        match column {
            Some(column) => self.add_column(table, column, comment),
            None => self.add_table(table, comment),
        }
    }
}

#[cfg(test)]
mod schema_comments_tests {
    use super::SchemaComments;

    #[test]
    fn table_and_column_comments_are_kept_apart() {
        let mut c = SchemaComments::default();
        c.add_row("users", None, "顧客");
        c.add_row("users", Some("name"), "氏名 / Họ tên");
        c.add_row("orders", Some("id"), "注文ID");
        assert_eq!(c.tables["users"], "顧客");
        assert_eq!(c.columns["users"]["name"], "氏名 / Họ tên");
        assert_eq!(c.columns["orders"]["id"], "注文ID");
        assert!(!c.tables.contains_key("orders"));
    }

    #[test]
    fn blank_comments_are_dropped() {
        let mut c = SchemaComments::default();
        c.add_row("t", None, "   ");
        c.add_row("t", Some("a"), "");
        c.add_row("t", Some("b"), "\n\t ");
        assert_eq!(c, SchemaComments::default());
    }

    #[test]
    fn comments_are_trimmed_but_otherwise_untouched() {
        let mut c = SchemaComments::default();
        c.add_row("t", Some("a"), "  line one\nline two  ");
        assert_eq!(c.columns["t"]["a"], "line one\nline two");
    }

    #[test]
    fn a_later_comment_for_the_same_column_wins() {
        let mut c = SchemaComments::default();
        c.add_row("t", Some("a"), "old");
        c.add_row("t", Some("a"), "new");
        assert_eq!(c.columns["t"]["a"], "new");
    }

    #[test]
    fn serializes_with_the_names_the_frontend_reads() {
        let mut c = SchemaComments::default();
        c.add_row("t", None, "T");
        c.add_row("t", Some("a"), "A");
        let json = serde_json::to_value(&c).unwrap();
        assert_eq!(json["tables"]["t"], "T");
        assert_eq!(json["columns"]["t"]["a"], "A");
    }
}
