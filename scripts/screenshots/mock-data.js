// Demo data for the README screenshots. Everything here is invented.
(() => {
  const caps = (extra) => ({
    schemas: false, views: true, routines: false, file_based: false, folder_based: false,
    connection_string: true, identifier_quote: '"', alter_primary_key: true,
    auto_increment_keyword: "", serial_type: "", inline_pk: false, alter_column: true,
    create_foreign_keys: true, no_connection_required: false, manage_tables: true, readonly: false,
    triggers: true, materialized_views: false, supports_ssl: true, sql_dialect: "postgres",
    ssl_modes: ["disable", "allow", "prefer", "require", "verify-ca", "verify-full"], default_ssl_mode: "prefer",
    begin_transaction_sql: "BEGIN;", supports_local_scan: true, ...extra,
  });
  const drivers = [
    { id: "postgres", name: "PostgreSQL", version: "1.0.0", description: "PostgreSQL databases", default_port: 5432, is_builtin: true, default_username: "postgres", color: "#3b82f6", icon: "postgres", settings: [], capabilities: caps({ schemas: true, materialized_views: true, serial_type: "SERIAL" }) },
    { id: "mysql", name: "MySQL", version: "1.0.0", description: "MySQL and MariaDB databases", default_port: 3306, is_builtin: true, default_username: "root", color: "#f97316", icon: "mysql", settings: [], capabilities: caps({ identifier_quote: "`", auto_increment_keyword: "AUTO_INCREMENT", sql_dialect: "mysql", ssl_modes: ["disabled", "preferred", "required", "verify_ca", "verify_identity"], default_ssl_mode: "required", begin_transaction_sql: "START TRANSACTION;", supports_pipes_as_concat: true, supports_cleartext_auth: true, routines: true }) },
    { id: "sqlite", name: "SQLite", version: "1.0.0", description: "SQLite file databases", default_port: null, is_builtin: true, default_username: "", color: "#10b981", icon: "sqlite", settings: [], capabilities: caps({ file_based: true, connection_string: false, supports_ssl: false, sql_dialect: "sqlite", inline_pk: true, ssl_modes: [], supports_local_scan: false, begin_transaction_sql: "BEGIN;" }) },
  ];

  const connections = [
    { id: "c-prod", name: "Shop · Production", environment: "production", params: { driver: "postgres", host: "db.shop-prod.example", port: 5432, username: "readonly", database: "shop", ssl_mode: "require" }, appearance: { accentColor: "#ef4444", environment: "production", safeMode: "strict" } },
    { id: "c-stg", name: "Shop · Staging", environment: "staging", params: { driver: "postgres", host: "db.shop-stg.example", port: 5432, username: "app", database: "shop" }, appearance: { accentColor: "#f59e0b", environment: "staging", safeMode: "alert" } },
    { id: "c-mysql", name: "Legacy CRM (MySQL)", params: { driver: "mysql", host: "10.0.4.12", port: 3306, username: "crm", database: "crm" }, appearance: { accentColor: "#f97316" } },
    { id: "c-sqlite", name: "Local test data", params: { driver: "sqlite", database: "/home/dev/test-data.sqlite" }, appearance: { accentColor: "#10b981" } },
  ];

  const col = (name, data_type, o = {}) => ({ name, data_type, is_pk: false, is_nullable: true, is_auto_increment: false, default_value: null, character_maximum_length: null, ...o });
  const tables = {
    customers: [col("id", "integer", { is_pk: true, is_nullable: false, is_auto_increment: true }), col("full_name", "character varying", { is_nullable: false, character_maximum_length: 100 }), col("email", "character varying", { character_maximum_length: 120 }), col("phone", "character varying", { character_maximum_length: 20 }), col("city", "character varying", { character_maximum_length: 60 }), col("created_at", "timestamp without time zone", { default_value: "now()" })],
    orders: [col("id", "integer", { is_pk: true, is_nullable: false, is_auto_increment: true }), col("customer_id", "integer", { is_nullable: false }), col("status", "character varying", { default_value: "'new'" }), col("total", "numeric"), col("ordered_at", "timestamp without time zone")],
    products: [col("id", "integer", { is_pk: true, is_nullable: false }), col("name", "character varying", { is_nullable: false }), col("price", "numeric"), col("stock", "integer")],
  };
  const fks = { orders: [{ name: "fk_orders_customer", column_name: "customer_id", ref_table: "customers", ref_column: "id", on_delete: "CASCADE", on_update: "NO ACTION" }] };

  const customerRows = [
    [1, "Nguyễn Văn An", "an.nguyen@example.com", "0912 345 678", "Hà Nội", "2026-01-12 09:14:02"],
    [2, "山田 太郎", "taro.yamada@example.jp", "090-1234-5678", "東京", "2026-01-15 11:40:55"],
    [3, "Trần Thị Bình", "binh.tran@example.com", "0987 654 321", "Đà Nẵng", "2026-02-03 16:22:10"],
    [4, "佐藤 花子", "hanako.sato@example.jp", "080-9876-5432", "大阪", "2026-02-18 08:05:31"],
    [5, "Lê Hoàng Cường", "cuong.le@example.com", "0905 111 222", "Hồ Chí Minh", "2026-03-01 13:47:19"],
    [6, "鈴木 一郎", "ichiro.suzuki@example.jp", "070-5555-1212", "名古屋", "2026-03-09 10:12:44"],
    [7, "Phạm Minh Đức", "duc.pham@example.com", "0933 444 555", "Hải Phòng", "2026-03-22 15:30:00"],
    [8, "Vũ Thu Hà", "ha.vu@example.com", "0977 888 999", "Cần Thơ", "2026-04-05 09:00:27"],
  ];

  const resultFor = (query) => {
    const q = String(query || "").toLowerCase();
    if (q.includes("count(")) return { columns: ["count"], rows: [[customerRows.length]], affected_rows: 0, truncated: false, pagination: null };
    return {
      columns: ["id", "full_name", "email", "phone", "city", "created_at"],
      rows: customerRows, affected_rows: 0, truncated: false,
      pagination: { page: 1, page_size: 100, total_rows: customerRows.length, has_more: false },
    };
  };

  window.__MOCK_HANDLERS__ = {
    get_config: { language: 'en', theme: 'tabularis-dark' }, is_debug_mode: false, check_ai_key: false,
    get_registered_drivers: drivers, get_installed_plugins: [],
    get_connections: connections, get_connection_groups: [], get_connections_with_groups: { groups: [], connections },
    get_all_themes: [], probe_local_databases: [], list_pending_approvals: [], set_window_title: null,
    get_last_open_connections: [], get_last_active_connection: null, set_last_open_connections: null,
    get_plugin_startup_errors: [], get_keybindings: {}, get_log_settings: { enabled: true, max_size: 1000, current_count: 0 },
    test_connection: "ok", connect_connection: null, list_databases: ["shop"], get_schemas: ["public"], get_selected_schemas: ["public"],
    get_tables: () => Object.keys(tables).map((name) => ({ name })),
    get_views: [], get_materialized_views: [], get_routines: [], get_triggers: [],
    get_columns: (a) => tables[a.tableName] || [],
    get_foreign_keys: (a) => fks[a.tableName] || [],
    get_indexes: (a) => [{ name: `${a.tableName}_pkey`, column_name: "id", is_unique: true, is_primary: true, seq_in_index: 1 }],
    get_schema_snapshot: () => Object.entries(tables).map(([name, columns]) => ({ name, columns, foreign_keys: fks[name] || [] })),
    get_schema_comments: () => ({ tables: { customers: "顧客 / Khách hàng", orders: "注文 / Đơn hàng", products: "商品 / Sản phẩm" }, columns: { customers: { full_name: "氏名 / Họ tên", email: "メール / Email", phone: "電話番号 / Số điện thoại", city: "市区町村 / Thành phố" } } }),
    execute_query: (a) => resultFor(a.query),
    count_query: customerRows.length,
    get_query_history: { entries: [
      { id: "h1", sql: "SELECT * FROM customers WHERE email = 'an.nguyen@example.com'", executedAt: new Date().toISOString(), executionTimeMs: 12, status: "success", rowsAffected: 1, error: null, database: null },
      { id: "h2", sql: "UPDATE orders SET status = 'shipped' WHERE id = 1042", executedAt: new Date().toISOString(), executionTimeMs: 8, status: "success", rowsAffected: 1, error: null, database: null },
    ], recoveredBackupPath: null },
    get_saved_queries: [], get_notebooks: [], list_notebooks: [], load_editor_preferences: null, save_editor_preferences: null,
    get_driver_manifest: (a) => drivers.find((d) => d.id === a.driverId) || drivers[0], register_active_connection: null, set_last_active_connection: null, save_config: null,
    save_binary_file_with_dialog: "C:\\Users\\you\\Documents\\table_definitions_shop.xlsx",
  };
})();
