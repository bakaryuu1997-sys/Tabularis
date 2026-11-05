export interface SqlTemplateParam {
  key: string;
  label: string;
  /** Translation key; takes precedence over `label` when present. */
  labelKey?: string;
  defaultValue: string;
  placeholder?: string;
  type?: "table" | "text" | "multiline";
}

export interface SqlTemplate {
  id: string;
  name: string;
  /** Translation key; takes precedence over `name` when present. */
  nameKey?: string;
  category: "select" | "join" | "dml" | "advanced" | "ddl" | "transaction";
  description: string;
  /** Translation key; takes precedence over `description` when present. */
  descriptionKey?: string;
  sql: string;
  params?: SqlTemplateParam[];
}

export const CATEGORIES: Array<{ id: string; label: string; labelKey: string }> = [
  { id: "all", label: "All", labelKey: "sqlTemplates.categories.all" },
  { id: "select", label: "SELECT & Analysis", labelKey: "sqlTemplates.categories.select" },
  { id: "join", label: "JOIN & Relations", labelKey: "sqlTemplates.categories.join" },
  { id: "dml", label: "INSERT / UPDATE / DELETE", labelKey: "sqlTemplates.categories.dml" },
  { id: "advanced", label: "CTE & Window", labelKey: "sqlTemplates.categories.advanced" },
  { id: "ddl", label: "Create tables (DDL)", labelKey: "sqlTemplates.categories.ddl" },
  { id: "transaction", label: "Safe transactions", labelKey: "sqlTemplates.categories.transaction" },
];

export const DEFAULT_TEMPLATES: SqlTemplate[] = [
  // --- SELECT & Analysis ---
  {
    id: "sel-from-where",
    name: "SELECT ... FROM ... WHERE",
    category: "select",
    description: "",
    descriptionKey: "sqlTemplates.items.sel-from-where.description",
    sql: `SELECT\n  {{columns}}\nFROM\n  {{tableName}}\nWHERE\n  {{condition}};`,
    params: [
      { key: "tableName", label: "", labelKey: "sqlTemplates.params.ten_bang", defaultValue: "table_name", type: "table" },
      { key: "columns", label: "", labelKey: "sqlTemplates.params.danh_sach_cot", defaultValue: "*", type: "text" },
      { key: "condition", label: "", labelKey: "sqlTemplates.params.dieu_kien_loc_where", defaultValue: "status = 'active'", type: "text" },
    ],
  },
  {
    id: "sel-count-group",
    name: "SELECT COUNT(*) & GROUP BY",
    category: "select",
    description: "",
    descriptionKey: "sqlTemplates.items.sel-count-group.description",
    sql: `SELECT\n  {{groupByCol}},\n  COUNT(*) AS total_records,\n  SUM({{metricCol}}) AS total_value\nFROM\n  {{tableName}}\nGROUP BY\n  {{groupByCol}}\nORDER BY\n  total_records DESC;`,
    params: [
      { key: "tableName", label: "", labelKey: "sqlTemplates.params.ten_bang", defaultValue: "orders", type: "table" },
      { key: "groupByCol", label: "", labelKey: "sqlTemplates.params.cot_gom_nhom", defaultValue: "category_id", type: "text" },
      { key: "metricCol", label: "", labelKey: "sqlTemplates.params.cot_tinh_tong", defaultValue: "amount", type: "text" },
    ],
  },
  {
    id: "sel-group-having",
    name: "SELECT ... GROUP BY ... HAVING ... ORDER BY",
    category: "select",
    description: "",
    descriptionKey: "sqlTemplates.items.sel-group-having.description",
    sql: `SELECT\n  {{groupByCol}},\n  COUNT(*) AS order_count,\n  SUM({{metricCol}}) AS total_amount\nFROM\n  {{tableName}}\nGROUP BY\n  {{groupByCol}}\nHAVING\n  COUNT(*) >= {{minCount}}\nORDER BY\n  total_amount DESC;`,
    params: [
      { key: "tableName", label: "", labelKey: "sqlTemplates.params.ten_bang", defaultValue: "orders", type: "table" },
      { key: "groupByCol", label: "", labelKey: "sqlTemplates.params.cot_gom_nhom", defaultValue: "customer_id", type: "text" },
      { key: "metricCol", label: "", labelKey: "sqlTemplates.params.cot_tinh_tong", defaultValue: "amount", type: "text" },
      { key: "minCount", label: "", labelKey: "sqlTemplates.params.so_luong_toi_thieu", defaultValue: "5", type: "text" },
    ],
  },
  {
    id: "sel-pagination-limit",
    name: "",
    nameKey: "sqlTemplates.items.sel-pagination-limit.name",
    category: "select",
    description: "",
    descriptionKey: "sqlTemplates.items.sel-pagination-limit.description",
    sql: `SELECT\n  *\nFROM\n  {{tableName}}\nORDER BY\n  id DESC\nLIMIT {{limit}} OFFSET {{offset}};`,
    params: [
      { key: "tableName", label: "", labelKey: "sqlTemplates.params.ten_bang", defaultValue: "table_name", type: "table" },
      { key: "limit", label: "", labelKey: "sqlTemplates.params.so_dong_limit", defaultValue: "50", type: "text" },
      { key: "offset", label: "", labelKey: "sqlTemplates.params.vi_tri_bat_dau_offset", defaultValue: "0", type: "text" },
    ],
  },
  {
    id: "sel-pagination-keyset",
    name: "",
    nameKey: "sqlTemplates.items.sel-pagination-keyset.name",
    category: "select",
    description: "",
    descriptionKey: "sqlTemplates.items.sel-pagination-keyset.description",
    sql: `SELECT\n  *\nFROM\n  {{tableName}}\nWHERE\n  id > {{cursorId}}\nORDER BY\n  id ASC\nLIMIT {{limit}};`,
    params: [
      { key: "tableName", label: "", labelKey: "sqlTemplates.params.ten_bang", defaultValue: "table_name", type: "table" },
      { key: "cursorId", label: "", labelKey: "sqlTemplates.params.id_moc_tiep_theo", defaultValue: "1000", type: "text" },
      { key: "limit", label: "", labelKey: "sqlTemplates.params.so_dong", defaultValue: "50", type: "text" },
    ],
  },
  {
    id: "sel-text-search",
    name: "",
    nameKey: "sqlTemplates.items.sel-text-search.name",
    category: "select",
    description: "",
    descriptionKey: "sqlTemplates.items.sel-text-search.description",
    sql: `SELECT\n  *\nFROM\n  {{tableName}}\nWHERE\n  {{searchCol}} ILIKE '%{{searchTerm}}%';`,
    params: [
      { key: "tableName", label: "", labelKey: "sqlTemplates.params.ten_bang", defaultValue: "users", type: "table" },
      { key: "searchCol", label: "", labelKey: "sqlTemplates.params.cot_tim_kiem", defaultValue: "name", type: "text" },
      { key: "searchTerm", label: "", labelKey: "sqlTemplates.params.tu_khoa_tim_kiem", defaultValue: "alex", type: "text" },
    ],
  },
  {
    id: "sel-time-series",
    name: "",
    nameKey: "sqlTemplates.items.sel-time-series.name",
    category: "select",
    description: "",
    descriptionKey: "sqlTemplates.items.sel-time-series.description",
    sql: `SELECT\n  DATE_TRUNC('month', {{dateCol}}) AS period,\n  COUNT(*) AS total_count,\n  SUM({{metricCol}}) AS total_amount\nFROM\n  {{tableName}}\nGROUP BY\n  period\nORDER BY\n  period DESC;`,
    params: [
      { key: "tableName", label: "", labelKey: "sqlTemplates.params.ten_bang", defaultValue: "orders", type: "table" },
      { key: "dateCol", label: "", labelKey: "sqlTemplates.params.cot_ngay_thang", defaultValue: "created_at", type: "text" },
      { key: "metricCol", label: "", labelKey: "sqlTemplates.params.cot_tinh_tong", defaultValue: "amount", type: "text" },
    ],
  },

  // --- JOIN & Relations ---
  {
    id: "join-inner",
    name: "",
    nameKey: "sqlTemplates.items.join-inner.name",
    category: "join",
    description: "",
    descriptionKey: "sqlTemplates.items.join-inner.description",
    sql: `SELECT\n  a.id,\n  a.created_at,\n  b.name AS {{tableB}}_name\nFROM\n  {{tableA}} a\nINNER JOIN\n  {{tableB}} b ON b.{{joinKeyB}} = a.{{joinKeyA}}\nWHERE\n  a.status = 'active';`,
    params: [
      { key: "tableA", label: "", labelKey: "sqlTemplates.params.bang_a_chinh", defaultValue: "orders", type: "table" },
      { key: "tableB", label: "", labelKey: "sqlTemplates.params.bang_b_lien_ket", defaultValue: "customers", type: "table" },
      { key: "joinKeyA", label: "", labelKey: "sqlTemplates.params.khoa_ngoai_o_bang_a", defaultValue: "customer_id", type: "text" },
      { key: "joinKeyB", label: "", labelKey: "sqlTemplates.params.khoa_chinh_o_bang_b", defaultValue: "id", type: "text" },
    ],
  },
  {
    id: "join-orphans",
    name: "",
    nameKey: "sqlTemplates.items.join-orphans.name",
    category: "join",
    description: "",
    descriptionKey: "sqlTemplates.items.join-orphans.description",
    sql: `SELECT\n  p.*\nFROM\n  {{parentTable}} p\nLEFT JOIN\n  {{childTable}} c ON c.{{fkCol}} = p.id\nWHERE\n  c.id IS NULL;`,
    params: [
      { key: "parentTable", label: "", labelKey: "sqlTemplates.params.bang_cha", defaultValue: "customers", type: "table" },
      { key: "childTable", label: "", labelKey: "sqlTemplates.params.bang_con", defaultValue: "orders", type: "table" },
      { key: "fkCol", label: "", labelKey: "sqlTemplates.params.cot_khoa_ngoai_o_bang_con", defaultValue: "customer_id", type: "text" },
    ],
  },
  {
    id: "join-multi",
    name: "",
    nameKey: "sqlTemplates.items.join-multi.name",
    category: "join",
    description: "",
    descriptionKey: "sqlTemplates.items.join-multi.description",
    sql: `SELECT\n  o.id AS order_id,\n  c.name AS customer_name,\n  p.name AS product_name,\n  oi.quantity,\n  oi.price\nFROM\n  orders o\nJOIN\n  customers c ON c.id = o.customer_id\nJOIN\n  order_items oi ON oi.order_id = o.id\nJOIN\n  products p ON p.id = oi.product_id\nWHERE\n  o.created_at >= CURRENT_DATE - INTERVAL '30 days';`,
  },
  {
    id: "join-self",
    name: "",
    nameKey: "sqlTemplates.items.join-self.name",
    category: "join",
    description: "",
    descriptionKey: "sqlTemplates.items.join-self.description",
    sql: `SELECT\n  e.id,\n  e.name AS employee_name,\n  m.name AS manager_name\nFROM\n  {{tableName}} e\nLEFT JOIN\n  {{tableName}} m ON m.id = e.{{managerCol}};`,
    params: [
      { key: "tableName", label: "", labelKey: "sqlTemplates.params.ten_bang", defaultValue: "employees", type: "table" },
      { key: "managerCol", label: "", labelKey: "sqlTemplates.params.cot_id_cap_tren", defaultValue: "manager_id", type: "text" },
    ],
  },

  // --- DML (INSERT / UPDATE / DELETE) ---
  {
    id: "ins-values",
    name: "INSERT INTO ... VALUES (...)",
    category: "dml",
    description: "",
    descriptionKey: "sqlTemplates.items.ins-values.description",
    sql: `INSERT INTO {{tableName}} ({{columns}})\nVALUES\n  ({{values}});`,
    params: [
      { key: "tableName", label: "", labelKey: "sqlTemplates.params.ten_bang", defaultValue: "users", type: "table" },
      { key: "columns", label: "", labelKey: "sqlTemplates.params.danh_sach_cot", defaultValue: "name, email, status", type: "text" },
      { key: "values", label: "", labelKey: "sqlTemplates.params.gia_tri", defaultValue: "'Nguyen Van A', 'a@example.com', 'active'", type: "text" },
    ],
  },
  {
    id: "ins-bulk",
    name: "",
    nameKey: "sqlTemplates.items.ins-bulk.name",
    category: "dml",
    description: "",
    descriptionKey: "sqlTemplates.items.ins-bulk.description",
    sql: `INSERT INTO {{tableName}} (name, status, score)\nVALUES\n  ('Alice', 'active', 95),\n  ('Bob', 'active', 88),\n  ('Charlie', 'pending', 72);`,
    params: [
      { key: "tableName", label: "", labelKey: "sqlTemplates.params.ten_bang", defaultValue: "students", type: "table" },
    ],
  },
  {
    id: "ins-select",
    name: "",
    nameKey: "sqlTemplates.items.ins-select.name",
    category: "dml",
    description: "",
    descriptionKey: "sqlTemplates.items.ins-select.description",
    sql: `INSERT INTO {{targetTable}} (order_id, amount, archived_at)\nSELECT\n  id,\n  amount,\n  CURRENT_TIMESTAMP\nFROM\n  {{sourceTable}}\nWHERE\n  created_at < '2025-01-01';`,
    params: [
      { key: "targetTable", label: "", labelKey: "sqlTemplates.params.bang_dich_luu_tru", defaultValue: "orders_archive", type: "table" },
      { key: "sourceTable", label: "", labelKey: "sqlTemplates.params.bang_nguon", defaultValue: "orders", type: "table" },
    ],
  },
  {
    id: "dml-upsert-pg",
    name: "UPSERT (PostgreSQL - ON CONFLICT DO UPDATE)",
    category: "dml",
    description: "",
    descriptionKey: "sqlTemplates.items.dml-upsert-pg.description",
    sql: `INSERT INTO {{tableName}} (id, name, score, updated_at)\nVALUES\n  (1, 'Alpha', 100, CURRENT_TIMESTAMP)\nON CONFLICT ({{conflictCol}}) DO UPDATE\nSET\n  name = EXCLUDED.name,\n  score = EXCLUDED.score,\n  updated_at = CURRENT_TIMESTAMP;`,
    params: [
      { key: "tableName", label: "", labelKey: "sqlTemplates.params.ten_bang", defaultValue: "user_scores", type: "table" },
      { key: "conflictCol", label: "", labelKey: "sqlTemplates.params.cot_khoa_trung_pk_unique", defaultValue: "id", type: "text" },
    ],
  },
  {
    id: "dml-upsert-mysql",
    name: "UPSERT (MySQL - ON DUPLICATE KEY UPDATE)",
    category: "dml",
    description: "",
    descriptionKey: "sqlTemplates.items.dml-upsert-mysql.description",
    sql: `INSERT INTO {{tableName}} (id, name, score, updated_at)\nVALUES\n  (1, 'Alpha', 100, NOW())\nON DUPLICATE KEY UPDATE\n  name = VALUES(name),\n  score = VALUES(score),\n  updated_at = NOW();`,
    params: [
      { key: "tableName", label: "", labelKey: "sqlTemplates.params.ten_bang", defaultValue: "user_scores", type: "table" },
    ],
  },
  {
    id: "upd-where",
    name: "",
    nameKey: "sqlTemplates.items.upd-where.name",
    category: "dml",
    description: "",
    descriptionKey: "sqlTemplates.items.upd-where.description",
    sql: `UPDATE {{tableName}}\nSET\n  {{setClause}}\nWHERE\n  {{whereClause}};`,
    params: [
      { key: "tableName", label: "", labelKey: "sqlTemplates.params.ten_bang", defaultValue: "orders", type: "table" },
      { key: "setClause", label: "", labelKey: "sqlTemplates.params.cot_gia_tri_cap_nhat", defaultValue: "status = 'completed', updated_at = CURRENT_TIMESTAMP", type: "text" },
      { key: "whereClause", label: "", labelKey: "sqlTemplates.params.dieu_kien_loc_where", defaultValue: "id = 1", type: "text" },
    ],
  },
  {
    id: "upd-join",
    name: "",
    nameKey: "sqlTemplates.items.upd-join.name",
    category: "dml",
    description: "",
    descriptionKey: "sqlTemplates.items.upd-join.description",
    sql: `UPDATE {{targetTable}} o\nSET\n  discount = c.vip_discount\nFROM\n  {{sourceTable}} c\nWHERE\n  c.id = o.customer_id\n  AND c.is_vip = true;`,
    params: [
      { key: "targetTable", label: "", labelKey: "sqlTemplates.params.bang_can_cap_nhat", defaultValue: "orders", type: "table" },
      { key: "sourceTable", label: "", labelKey: "sqlTemplates.params.bang_nguon_du_lieu", defaultValue: "customers", type: "table" },
    ],
  },
  {
    id: "del-where",
    name: "",
    nameKey: "sqlTemplates.items.del-where.name",
    category: "dml",
    description: "",
    descriptionKey: "sqlTemplates.items.del-where.description",
    sql: `DELETE FROM {{tableName}}\nWHERE\n  {{whereClause}};`,
    params: [
      { key: "tableName", label: "", labelKey: "sqlTemplates.params.ten_bang", defaultValue: "logs", type: "table" },
      { key: "whereClause", label: "", labelKey: "sqlTemplates.params.dieu_kien_xoa_where", defaultValue: "created_at < '2025-01-01'", type: "text" },
    ],
  },

  // --- Advanced (CTE & Window) ---
  {
    id: "cte-with",
    name: "",
    nameKey: "sqlTemplates.items.cte-with.name",
    category: "advanced",
    description: "",
    descriptionKey: "sqlTemplates.items.cte-with.description",
    sql: `WITH filtered_data AS (\n  SELECT\n    user_id,\n    SUM(amount) AS total\n  FROM\n    orders\n  WHERE\n    created_at >= '2026-01-01'\n  GROUP BY\n    user_id\n)\nSELECT\n  u.name,\n  f.total\nFROM\n  filtered_data f\nJOIN\n  users u ON u.id = f.user_id\nORDER BY\n  f.total DESC;`,
  },
  {
    id: "cte-recursive",
    name: "",
    nameKey: "sqlTemplates.items.cte-recursive.name",
    category: "advanced",
    description: "",
    descriptionKey: "sqlTemplates.items.cte-recursive.description",
    sql: `WITH RECURSIVE category_tree AS (\n  SELECT\n    id, name, parent_id, 1 AS level, name::text AS path\n  FROM\n    categories\n  WHERE\n    parent_id IS NULL\n\n  UNION ALL\n\n  SELECT\n    c.id, c.name, c.parent_id, ct.level + 1, ct.path || ' > ' || c.name\n  FROM\n    categories c\n  JOIN\n    category_tree ct ON ct.id = c.parent_id\n)\nSELECT * FROM category_tree ORDER BY path;`,
  },
  {
    id: "window-rank",
    name: "",
    nameKey: "sqlTemplates.items.window-rank.name",
    category: "advanced",
    description: "",
    descriptionKey: "sqlTemplates.items.window-rank.description",
    sql: `SELECT\n  id,\n  category_id,\n  name,\n  price,\n  ROW_NUMBER() OVER (\n    PARTITION BY category_id\n    ORDER BY price DESC\n  ) AS rank_in_category\nFROM\n  products;`,
  },
  {
    id: "window-running-total",
    name: "",
    nameKey: "sqlTemplates.items.window-running-total.name",
    category: "advanced",
    description: "",
    descriptionKey: "sqlTemplates.items.window-running-total.description",
    sql: `SELECT\n  created_at::date AS order_date,\n  amount,\n  SUM(amount) OVER (\n    ORDER BY created_at\n    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW\n  ) AS running_total\nFROM\n  orders;`,
  },
  {
    id: "case-when",
    name: "",
    nameKey: "sqlTemplates.items.case-when.name",
    category: "advanced",
    description: "",
    descriptionKey: "sqlTemplates.items.case-when.description",
    sql: `SELECT\n  id,\n  amount,\n  CASE\n    WHEN amount >= 1000 THEN 'VIP'\n    WHEN amount >= 500  THEN 'Standard'\n    ELSE 'Bronze'\n  END AS customer_tier\nFROM\n  orders;`,
  },

  // --- DDL & Tables ---
  {
    id: "create-table",
    name: "",
    nameKey: "sqlTemplates.items.create-table.name",
    category: "ddl",
    description: "",
    descriptionKey: "sqlTemplates.items.create-table.description",
    sql: `CREATE TABLE {{tableName}} (\n{{columnsDef}}\n);`,
    params: [
      { key: "tableName", label: "", labelKey: "sqlTemplates.params.ten_bang_moi", defaultValue: "new_table", type: "table" },
      {
        key: "columnsDef",
        label: "", labelKey: "sqlTemplates.params.dinh_nghia_cac_cot_thuoc_tinh",
        defaultValue: `  id SERIAL PRIMARY KEY,\n  name VARCHAR(255) NOT NULL,\n  status VARCHAR(50) DEFAULT 'active',\n  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,\n  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`,
        type: "multiline",
      },
    ],
  },
  {
    id: "create-table-fk",
    name: "",
    nameKey: "sqlTemplates.items.create-table-fk.name",
    category: "ddl",
    description: "",
    descriptionKey: "sqlTemplates.items.create-table-fk.description",
    sql: `CREATE TABLE {{tableName}} (\n  id SERIAL PRIMARY KEY,\n  {{parentFkCol}} INTEGER NOT NULL REFERENCES {{parentTable}}(id) ON DELETE CASCADE,\n  product_id INTEGER NOT NULL,\n  quantity INTEGER NOT NULL CHECK (quantity > 0),\n  price DECIMAL(12, 2) NOT NULL,\n  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP\n);`,
    params: [
      { key: "tableName", label: "", labelKey: "sqlTemplates.params.ten_bang_con_moi", defaultValue: "order_items", type: "table" },
      { key: "parentTable", label: "", labelKey: "sqlTemplates.params.bang_cha_lien_ket", defaultValue: "orders", type: "table" },
      { key: "parentFkCol", label: "", labelKey: "sqlTemplates.params.ten_cot_khoa_ngoai", defaultValue: "order_id", type: "text" },
    ],
  },
  {
    id: "create-index",
    name: "CREATE INDEX & COMPOSITE INDEX",
    category: "ddl",
    description: "",
    descriptionKey: "sqlTemplates.items.create-index.description",
    sql: `CREATE INDEX {{indexName}}\nON {{tableName}} ({{columns}});`,
    params: [
      { key: "indexName", label: "", labelKey: "sqlTemplates.params.ten_index", defaultValue: "idx_orders_customer_status", type: "text" },
      { key: "tableName", label: "", labelKey: "sqlTemplates.params.ten_bang", defaultValue: "orders", type: "table" },
      { key: "columns", label: "", labelKey: "sqlTemplates.params.cac_cot_danh_index", defaultValue: "customer_id, status", type: "text" },
    ],
  },
  {
    id: "alter-add-column",
    name: "",
    nameKey: "sqlTemplates.items.alter-add-column.name",
    category: "ddl",
    description: "",
    descriptionKey: "sqlTemplates.items.alter-add-column.description",
    sql: `ALTER TABLE {{tableName}}\nADD COLUMN {{columnName}} {{columnType}};`,
    params: [
      { key: "tableName", label: "", labelKey: "sqlTemplates.params.ten_bang", defaultValue: "users", type: "table" },
      { key: "columnName", label: "", labelKey: "sqlTemplates.params.ten_cot_moi", defaultValue: "phone_number", type: "text" },
      { key: "columnType", label: "", labelKey: "sqlTemplates.params.kieu_du_lieu_mac_dinh", defaultValue: "VARCHAR(20) DEFAULT NULL", type: "text" },
    ],
  },
  {
    id: "create-view",
    name: "",
    nameKey: "sqlTemplates.items.create-view.name",
    category: "ddl",
    description: "",
    descriptionKey: "sqlTemplates.items.create-view.description",
    sql: `CREATE OR REPLACE VIEW {{viewName}} AS\nSELECT\n  c.id,\n  c.name,\n  c.email,\n  COUNT(o.id) AS total_orders\nFROM\n  customers c\nLEFT JOIN\n  orders o ON o.customer_id = c.id\nWHERE\n  c.status = 'active'\nGROUP BY\n  c.id, c.name, c.email;`,
    params: [
      { key: "viewName", label: "", labelKey: "sqlTemplates.params.ten_view", defaultValue: "v_active_customers_summary", type: "text" },
    ],
  },

  // --- Transactions & Optimization ---
  {
    id: "txn-safe",
    name: "",
    nameKey: "sqlTemplates.items.txn-safe.name",
    category: "transaction",
    description: "",
    descriptionKey: "sqlTemplates.items.txn-safe.description",
    sql: `BEGIN;\n\n-- Step 1: debit account A\nUPDATE accounts\nSET balance = balance - 100\nWHERE id = 1 AND balance >= 100;\n\n-- Step 2: credit account B\nUPDATE accounts\nSET balance = balance + 100\nWHERE id = 2;\n\n-- Commit on success, roll back on error\nCOMMIT;\n-- ROLLBACK;`,
  },
];

export function resolveSql(
  template: SqlTemplate,
  customParams?: Record<string, string>,
  activeTable?: string | null
): string {
  let result = template.sql;
  if (!template.params || template.params.length === 0) {
    return result;
  }
  for (const p of template.params) {
    let val = customParams?.[p.key];
    if (val === undefined || val === "") {
      if (p.type === "table" && activeTable && p.key === "tableName") {
        val = activeTable;
      } else {
        val = p.defaultValue;
      }
    }
    const regex = new RegExp(`\\{\\{${p.key}\\}\\}`, "g");
    result = result.replace(regex, val);
  }
  return result;
}
