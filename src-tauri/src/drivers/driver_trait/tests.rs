use super::{DatabaseDriver, DriverCapabilities};
use crate::drivers::mysql::MysqlDriver;
use crate::drivers::postgres::PostgresDriver;
use crate::drivers::sqlite::SqliteDriver;

/// A plugin written before the connection-form capabilities existed must keep its old behaviour.
#[test]
fn an_old_plugin_manifest_gets_neutral_defaults() {
    let caps: DriverCapabilities = serde_json::from_str(
        r#"{"schemas":false,"views":true,"routines":false,"file_based":false}"#,
    )
    .unwrap();
    assert!(caps.ssl_modes.is_empty());
    assert!(caps.default_ssl_mode.is_empty());
    assert_eq!(caps.begin_transaction_sql, "START TRANSACTION;");
    assert!(!caps.supports_local_scan);
    assert!(!caps.supports_pipes_as_concat);
    assert!(!caps.supports_cleartext_auth);
}

#[test]
fn a_plugin_can_declare_the_fields_in_snake_or_camel_case() {
    let snake: DriverCapabilities = serde_json::from_str(
        r#"{"schemas":false,"views":true,"routines":false,"file_based":false,
            "ssl_modes":["disable","require"],"default_ssl_mode":"disable","begin_transaction_sql":"BEGIN;"}"#,
    )
    .unwrap();
    let camel: DriverCapabilities = serde_json::from_str(
        r#"{"schemas":false,"views":true,"routines":false,"file_based":false,
            "sslModes":["disable","require"],"defaultSslMode":"disable","beginTransactionSql":"BEGIN;"}"#,
    )
    .unwrap();
    for caps in [snake, camel] {
        assert_eq!(caps.ssl_modes, ["disable", "require"]);
        assert_eq!(caps.default_ssl_mode, "disable");
        assert_eq!(caps.begin_transaction_sql, "BEGIN;");
    }
}

#[test]
fn postgres_declares_its_own_modes_and_transaction_statement() {
    let caps = &PostgresDriver::new().manifest().capabilities.clone();
    assert_eq!(caps.ssl_modes, ["disable", "allow", "prefer", "require", "verify-ca", "verify-full"]);
    assert_eq!(caps.default_ssl_mode, "prefer");
    assert_eq!(caps.begin_transaction_sql, "BEGIN;");
    assert!(caps.supports_local_scan);
    assert!(!caps.supports_pipes_as_concat && !caps.supports_cleartext_auth);
}

#[test]
fn mysql_declares_its_own_modes_and_options() {
    let caps = &MysqlDriver::new().manifest().capabilities.clone();
    assert_eq!(caps.ssl_modes, ["disabled", "preferred", "required", "verify_ca", "verify_identity"]);
    assert_eq!(caps.default_ssl_mode, "required");
    assert_eq!(caps.begin_transaction_sql, "START TRANSACTION;");
    assert!(caps.supports_local_scan && caps.supports_pipes_as_concat && caps.supports_cleartext_auth);
}

#[test]
fn sqlite_has_no_network_options() {
    let caps = &SqliteDriver::new().manifest().capabilities.clone();
    assert_eq!(caps.begin_transaction_sql, "BEGIN;");
    assert!(caps.ssl_modes.is_empty());
    assert!(!caps.supports_local_scan && !caps.supports_pipes_as_concat && !caps.supports_cleartext_auth);
}
