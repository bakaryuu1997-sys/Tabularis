import { useState, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Search,
  Zap,
  Copy,
  Check,
  X,
  ArrowRight,
  SlidersHorizontal,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { Modal } from "../ui/Modal";
import { copyTextToClipboard } from "../../utils/clipboard";

export interface SqlTemplateParam {
  key: string;
  label: string;
  defaultValue: string;
  placeholder?: string;
  type?: "table" | "text" | "multiline";
}

export interface SqlTemplate {
  id: string;
  name: string;
  category: "select" | "join" | "dml" | "advanced" | "ddl" | "transaction";
  description: string;
  sql: string;
  params?: SqlTemplateParam[];
}

export const CATEGORIES: Array<{ id: string; label: string }> = [
  { id: "all", label: "Tất cả" },
  { id: "select", label: "SELECT & Phân tích" },
  { id: "join", label: "JOIN & Quan hệ" },
  { id: "dml", label: "INSERT / UPDATE / DELETE" },
  { id: "advanced", label: "CTE & Window" },
  { id: "ddl", label: "Tạo bảng DDL" },
  { id: "transaction", label: "Giao dịch an toàn" },
];

export const DEFAULT_TEMPLATES: SqlTemplate[] = [
  // --- SELECT & Phân tích ---
  {
    id: "sel-from-where",
    name: "SELECT ... FROM ... WHERE",
    category: "select",
    description: "Truy vấn chọn dữ liệu cơ bản có điều kiện lọc",
    sql: `SELECT\n  {{columns}}\nFROM\n  {{tableName}}\nWHERE\n  {{condition}};`,
    params: [
      { key: "tableName", label: "Tên bảng", defaultValue: "table_name", type: "table" },
      { key: "columns", label: "Danh sách cột", defaultValue: "*", type: "text" },
      { key: "condition", label: "Điều kiện lọc (WHERE)", defaultValue: "status = 'active'", type: "text" },
    ],
  },
  {
    id: "sel-count-group",
    name: "SELECT COUNT(*) & GROUP BY",
    category: "select",
    description: "Gom nhóm thống kê số lượng và tổng giá trị",
    sql: `SELECT\n  {{groupByCol}},\n  COUNT(*) AS total_records,\n  SUM({{metricCol}}) AS total_value\nFROM\n  {{tableName}}\nGROUP BY\n  {{groupByCol}}\nORDER BY\n  total_records DESC;`,
    params: [
      { key: "tableName", label: "Tên bảng", defaultValue: "orders", type: "table" },
      { key: "groupByCol", label: "Cột gom nhóm", defaultValue: "category_id", type: "text" },
      { key: "metricCol", label: "Cột tính tổng", defaultValue: "amount", type: "text" },
    ],
  },
  {
    id: "sel-group-having",
    name: "SELECT ... GROUP BY ... HAVING ... ORDER BY",
    category: "select",
    description: "Gom nhóm thống kê có điều kiện lọc trên nhóm",
    sql: `SELECT\n  {{groupByCol}},\n  COUNT(*) AS order_count,\n  SUM({{metricCol}}) AS total_amount\nFROM\n  {{tableName}}\nGROUP BY\n  {{groupByCol}}\nHAVING\n  COUNT(*) >= {{minCount}}\nORDER BY\n  total_amount DESC;`,
    params: [
      { key: "tableName", label: "Tên bảng", defaultValue: "orders", type: "table" },
      { key: "groupByCol", label: "Cột gom nhóm", defaultValue: "customer_id", type: "text" },
      { key: "metricCol", label: "Cột tính tổng", defaultValue: "amount", type: "text" },
      { key: "minCount", label: "Số lượng tối thiểu", defaultValue: "5", type: "text" },
    ],
  },
  {
    id: "sel-pagination-limit",
    name: "SELECT Phân trang (LIMIT / OFFSET)",
    category: "select",
    description: "Truy vấn phân trang dữ liệu theo kích thước trang",
    sql: `SELECT\n  *\nFROM\n  {{tableName}}\nORDER BY\n  id DESC\nLIMIT {{limit}} OFFSET {{offset}};`,
    params: [
      { key: "tableName", label: "Tên bảng", defaultValue: "table_name", type: "table" },
      { key: "limit", label: "Số dòng (LIMIT)", defaultValue: "50", type: "text" },
      { key: "offset", label: "Vị trí bắt đầu (OFFSET)", defaultValue: "0", type: "text" },
    ],
  },
  {
    id: "sel-pagination-keyset",
    name: "SELECT Phân trang Keyset (Cursor - Siêu tốc)",
    category: "select",
    description: "Phân trang hiệu năng cao cho bảng lớn triệu dòng, không dùng OFFSET",
    sql: `SELECT\n  *\nFROM\n  {{tableName}}\nWHERE\n  id > {{cursorId}}\nORDER BY\n  id ASC\nLIMIT {{limit}};`,
    params: [
      { key: "tableName", label: "Tên bảng", defaultValue: "table_name", type: "table" },
      { key: "cursorId", label: "ID mốc tiếp theo", defaultValue: "1000", type: "text" },
      { key: "limit", label: "Số dòng", defaultValue: "50", type: "text" },
    ],
  },
  {
    id: "sel-text-search",
    name: "SELECT Tìm kiếm văn bản (ILIKE / LIKE)",
    category: "select",
    description: "Tìm kiếm văn bản chứa chuỗi không phân biệt hoa thường",
    sql: `SELECT\n  *\nFROM\n  {{tableName}}\nWHERE\n  {{searchCol}} ILIKE '%{{searchTerm}}%';`,
    params: [
      { key: "tableName", label: "Tên bảng", defaultValue: "users", type: "table" },
      { key: "searchCol", label: "Cột tìm kiếm", defaultValue: "name", type: "text" },
      { key: "searchTerm", label: "Từ khóa tìm kiếm", defaultValue: "alex", type: "text" },
    ],
  },
  {
    id: "sel-time-series",
    name: "SELECT Thống kê theo Thời gian (DATE_TRUNC)",
    category: "select",
    description: "Gom nhóm doanh thu và số lượng theo ngày hoặc tháng",
    sql: `SELECT\n  DATE_TRUNC('month', {{dateCol}}) AS period,\n  COUNT(*) AS total_count,\n  SUM({{metricCol}}) AS total_amount\nFROM\n  {{tableName}}\nGROUP BY\n  period\nORDER BY\n  period DESC;`,
    params: [
      { key: "tableName", label: "Tên bảng", defaultValue: "orders", type: "table" },
      { key: "dateCol", label: "Cột ngày tháng", defaultValue: "created_at", type: "text" },
      { key: "metricCol", label: "Cột tính tổng", defaultValue: "amount", type: "text" },
    ],
  },

  // --- JOIN & Quan hệ ---
  {
    id: "join-inner",
    name: "SELECT ... INNER JOIN ... ON (Kết nối 2 bảng)",
    category: "join",
    description: "Kết nối 2 bảng dựa trên khóa ngoại và điều kiện lọc",
    sql: `SELECT\n  a.id,\n  a.created_at,\n  b.name AS {{tableB}}_name\nFROM\n  {{tableA}} a\nINNER JOIN\n  {{tableB}} b ON b.{{joinKeyB}} = a.{{joinKeyA}}\nWHERE\n  a.status = 'active';`,
    params: [
      { key: "tableA", label: "Bảng A (Chính)", defaultValue: "orders", type: "table" },
      { key: "tableB", label: "Bảng B (Liên kết)", defaultValue: "customers", type: "table" },
      { key: "joinKeyA", label: "Khóa ngoại ở Bảng A", defaultValue: "customer_id", type: "text" },
      { key: "joinKeyB", label: "Khóa chính ở Bảng B", defaultValue: "id", type: "text" },
    ],
  },
  {
    id: "join-orphans",
    name: "SELECT ... LEFT JOIN ... ON (Tìm bản ghi mồ côi)",
    category: "join",
    description: "Tìm các bản ghi không có liên kết (ví dụ: khách hàng chưa từng mua hàng)",
    sql: `SELECT\n  p.*\nFROM\n  {{parentTable}} p\nLEFT JOIN\n  {{childTable}} c ON c.{{fkCol}} = p.id\nWHERE\n  c.id IS NULL;`,
    params: [
      { key: "parentTable", label: "Bảng Cha", defaultValue: "customers", type: "table" },
      { key: "childTable", label: "Bảng Con", defaultValue: "orders", type: "table" },
      { key: "fkCol", label: "Cột khóa ngoại ở bảng con", defaultValue: "customer_id", type: "text" },
    ],
  },
  {
    id: "join-multi",
    name: "JOIN 3 Bảng (Đơn hàng • Khách • Chi tiết)",
    category: "join",
    description: "Kết nối chuỗi nhiều bảng trong mô hình thương mại",
    sql: `SELECT\n  o.id AS order_id,\n  c.name AS customer_name,\n  p.name AS product_name,\n  oi.quantity,\n  oi.price\nFROM\n  orders o\nJOIN\n  customers c ON c.id = o.customer_id\nJOIN\n  order_items oi ON oi.order_id = o.id\nJOIN\n  products p ON p.id = oi.product_id\nWHERE\n  o.created_at >= CURRENT_DATE - INTERVAL '30 days';`,
  },
  {
    id: "join-self",
    name: "SELF JOIN (Cây Phân Cấp Cha - Con)",
    category: "join",
    description: "Bảng tự kết nối với chính nó (quản lý / nhân viên, thư mục cha / con)",
    sql: `SELECT\n  e.id,\n  e.name AS employee_name,\n  m.name AS manager_name\nFROM\n  {{tableName}} e\nLEFT JOIN\n  {{tableName}} m ON m.id = e.{{managerCol}};`,
    params: [
      { key: "tableName", label: "Tên bảng", defaultValue: "employees", type: "table" },
      { key: "managerCol", label: "Cột ID cấp trên", defaultValue: "manager_id", type: "text" },
    ],
  },

  // --- DML (INSERT / UPDATE / DELETE) ---
  {
    id: "ins-values",
    name: "INSERT INTO ... VALUES (...)",
    category: "dml",
    description: "Thêm một dòng dữ liệu mới vào bảng",
    sql: `INSERT INTO {{tableName}} ({{columns}})\nVALUES\n  ({{values}});`,
    params: [
      { key: "tableName", label: "Tên bảng", defaultValue: "users", type: "table" },
      { key: "columns", label: "Danh sách cột", defaultValue: "name, email, status", type: "text" },
      { key: "values", label: "Giá trị", defaultValue: "'Nguyen Van A', 'a@example.com', 'active'", type: "text" },
    ],
  },
  {
    id: "ins-bulk",
    name: "INSERT INTO Nhiều dòng (Bulk Insert)",
    category: "dml",
    description: "Thêm hàng loạt bản ghi trong một câu truy vấn duy nhất",
    sql: `INSERT INTO {{tableName}} (name, status, score)\nVALUES\n  ('Alice', 'active', 95),\n  ('Bob', 'active', 88),\n  ('Charlie', 'pending', 72);`,
    params: [
      { key: "tableName", label: "Tên bảng", defaultValue: "students", type: "table" },
    ],
  },
  {
    id: "ins-select",
    name: "INSERT INTO ... SELECT (Sao chép dữ liệu)",
    category: "dml",
    description: "Nạp dữ liệu sang bảng khác hoặc lưu trữ archive",
    sql: `INSERT INTO {{targetTable}} (order_id, amount, archived_at)\nSELECT\n  id,\n  amount,\n  CURRENT_TIMESTAMP\nFROM\n  {{sourceTable}}\nWHERE\n  created_at < '2025-01-01';`,
    params: [
      { key: "targetTable", label: "Bảng Đích (Lưu trữ)", defaultValue: "orders_archive", type: "table" },
      { key: "sourceTable", label: "Bảng Nguồn", defaultValue: "orders", type: "table" },
    ],
  },
  {
    id: "dml-upsert-pg",
    name: "UPSERT (PostgreSQL - ON CONFLICT DO UPDATE)",
    category: "dml",
    description: "Chèn mới nếu chưa có, cập nhật nếu đã tồn tại khóa trùng",
    sql: `INSERT INTO {{tableName}} (id, name, score, updated_at)\nVALUES\n  (1, 'Alpha', 100, CURRENT_TIMESTAMP)\nON CONFLICT ({{conflictCol}}) DO UPDATE\nSET\n  name = EXCLUDED.name,\n  score = EXCLUDED.score,\n  updated_at = CURRENT_TIMESTAMP;`,
    params: [
      { key: "tableName", label: "Tên bảng", defaultValue: "user_scores", type: "table" },
      { key: "conflictCol", label: "Cột khóa trùng (PK/Unique)", defaultValue: "id", type: "text" },
    ],
  },
  {
    id: "dml-upsert-mysql",
    name: "UPSERT (MySQL - ON DUPLICATE KEY UPDATE)",
    category: "dml",
    description: "Cú pháp chèn hoặc cập nhật chuẩn MySQL / MariaDB",
    sql: `INSERT INTO {{tableName}} (id, name, score, updated_at)\nVALUES\n  (1, 'Alpha', 100, NOW())\nON DUPLICATE KEY UPDATE\n  name = VALUES(name),\n  score = VALUES(score),\n  updated_at = NOW();`,
    params: [
      { key: "tableName", label: "Tên bảng", defaultValue: "user_scores", type: "table" },
    ],
  },
  {
    id: "upd-where",
    name: "UPDATE ... SET ... WHERE (An toàn)",
    category: "dml",
    description: "Cập nhật dữ liệu có điều kiện WHERE bảo vệ",
    sql: `UPDATE {{tableName}}\nSET\n  {{setClause}}\nWHERE\n  {{whereClause}};`,
    params: [
      { key: "tableName", label: "Tên bảng", defaultValue: "orders", type: "table" },
      { key: "setClause", label: "Cột & Giá trị cập nhật", defaultValue: "status = 'completed', updated_at = CURRENT_TIMESTAMP", type: "text" },
      { key: "whereClause", label: "Điều kiện lọc (WHERE)", defaultValue: "id = 1", type: "text" },
    ],
  },
  {
    id: "upd-join",
    name: "UPDATE từ JOIN Bảng khác",
    category: "dml",
    description: "Đồng bộ hoặc cập nhật giá trị dựa trên bảng liên kết",
    sql: `UPDATE {{targetTable}} o\nSET\n  discount = c.vip_discount\nFROM\n  {{sourceTable}} c\nWHERE\n  c.id = o.customer_id\n  AND c.is_vip = true;`,
    params: [
      { key: "targetTable", label: "Bảng cần cập nhật", defaultValue: "orders", type: "table" },
      { key: "sourceTable", label: "Bảng nguồn dữ liệu", defaultValue: "customers", type: "table" },
    ],
  },
  {
    id: "del-where",
    name: "DELETE FROM ... WHERE (An toàn)",
    category: "dml",
    description: "Xóa dữ liệu an toàn có điều kiện WHERE rõ ràng",
    sql: `DELETE FROM {{tableName}}\nWHERE\n  {{whereClause}};`,
    params: [
      { key: "tableName", label: "Tên bảng", defaultValue: "logs", type: "table" },
      { key: "whereClause", label: "Điều kiện xóa (WHERE)", defaultValue: "created_at < '2025-01-01'", type: "text" },
    ],
  },

  // --- Advanced (CTE & Window) ---
  {
    id: "cte-with",
    name: "CTE (WITH ... AS) Bảng tạm",
    category: "advanced",
    description: "Mệnh đề bảng tạm CTE giúp query phức tạp trở nên mạch lạc",
    sql: `WITH filtered_data AS (\n  SELECT\n    user_id,\n    SUM(amount) AS total\n  FROM\n    orders\n  WHERE\n    created_at >= '2026-01-01'\n  GROUP BY\n    user_id\n)\nSELECT\n  u.name,\n  f.total\nFROM\n  filtered_data f\nJOIN\n  users u ON u.id = f.user_id\nORDER BY\n  f.total DESC;`,
  },
  {
    id: "cte-recursive",
    name: "Recursive CTE (Đệ quy Cây Danh mục)",
    category: "advanced",
    description: "Duyệt toàn bộ cấu trúc cây cha-con vô hạn cấp bậc",
    sql: `WITH RECURSIVE category_tree AS (\n  SELECT\n    id, name, parent_id, 1 AS level, name::text AS path\n  FROM\n    categories\n  WHERE\n    parent_id IS NULL\n\n  UNION ALL\n\n  SELECT\n    c.id, c.name, c.parent_id, ct.level + 1, ct.path || ' > ' || c.name\n  FROM\n    categories c\n  JOIN\n    category_tree ct ON ct.id = c.parent_id\n)\nSELECT * FROM category_tree ORDER BY path;`,
  },
  {
    id: "window-rank",
    name: "Window Function - Xếp hạng (ROW_NUMBER)",
    category: "advanced",
    description: "Đánh số thứ tự và xếp hạng top N trong từng nhóm dữ liệu",
    sql: `SELECT\n  id,\n  category_id,\n  name,\n  price,\n  ROW_NUMBER() OVER (\n    PARTITION BY category_id\n    ORDER BY price DESC\n  ) AS rank_in_category\nFROM\n  products;`,
  },
  {
    id: "window-running-total",
    name: "Window Function - Tổng lũy kế (Running Total)",
    category: "advanced",
    description: "Tính tổng dồn lũy kế liên tục theo dòng thời gian",
    sql: `SELECT\n  created_at::date AS order_date,\n  amount,\n  SUM(amount) OVER (\n    ORDER BY created_at\n    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW\n  ) AS running_total\nFROM\n  orders;`,
  },
  {
    id: "case-when",
    name: "CASE WHEN Phân loại đa điều kiện",
    category: "advanced",
    description: "Biểu thức rẽ nhánh có điều kiện trong câu lệnh SELECT",
    sql: `SELECT\n  id,\n  amount,\n  CASE\n    WHEN amount >= 1000 THEN 'VIP'\n    WHEN amount >= 500  THEN 'Standard'\n    ELSE 'Bronze'\n  END AS customer_tier\nFROM\n  orders;`,
  },

  // --- DDL & Tạo bảng ---
  {
    id: "create-table",
    name: "CREATE TABLE Chuẩn đầy đủ",
    category: "ddl",
    description: "Tạo cấu trúc bảng mới chuẩn SQL kèm thuộc tính tùy biến",
    sql: `CREATE TABLE {{tableName}} (\n{{columnsDef}}\n);`,
    params: [
      { key: "tableName", label: "Tên bảng mới", defaultValue: "new_table", type: "table" },
      {
        key: "columnsDef",
        label: "Định nghĩa các cột & thuộc tính",
        defaultValue: `  id SERIAL PRIMARY KEY,\n  name VARCHAR(255) NOT NULL,\n  status VARCHAR(50) DEFAULT 'active',\n  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,\n  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`,
        type: "multiline",
      },
    ],
  },
  {
    id: "create-table-fk",
    name: "CREATE TABLE có Khóa ngoại (Foreign Key)",
    category: "ddl",
    description: "Tạo bảng liên kết có ràng buộc khóa ngoại và ON DELETE CASCADE",
    sql: `CREATE TABLE {{tableName}} (\n  id SERIAL PRIMARY KEY,\n  {{parentFkCol}} INTEGER NOT NULL REFERENCES {{parentTable}}(id) ON DELETE CASCADE,\n  product_id INTEGER NOT NULL,\n  quantity INTEGER NOT NULL CHECK (quantity > 0),\n  price DECIMAL(12, 2) NOT NULL,\n  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP\n);`,
    params: [
      { key: "tableName", label: "Tên bảng con mới", defaultValue: "order_items", type: "table" },
      { key: "parentTable", label: "Bảng Cha liên kết", defaultValue: "orders", type: "table" },
      { key: "parentFkCol", label: "Tên cột khóa ngoại", defaultValue: "order_id", type: "text" },
    ],
  },
  {
    id: "create-index",
    name: "CREATE INDEX & COMPOSITE INDEX",
    category: "ddl",
    description: "Tạo chỉ mục đơn hoặc chỉ mục ghép tăng tốc độ tìm kiếm",
    sql: `CREATE INDEX {{indexName}}\nON {{tableName}} ({{columns}});`,
    params: [
      { key: "indexName", label: "Tên Index", defaultValue: "idx_orders_customer_status", type: "text" },
      { key: "tableName", label: "Tên bảng", defaultValue: "orders", type: "table" },
      { key: "columns", label: "Các cột đánh index", defaultValue: "customer_id, status", type: "text" },
    ],
  },
  {
    id: "alter-add-column",
    name: "ALTER TABLE Thêm cột mới",
    category: "ddl",
    description: "Thêm trường dữ liệu mới vào bảng hiện có một cách an toàn",
    sql: `ALTER TABLE {{tableName}}\nADD COLUMN {{columnName}} {{columnType}};`,
    params: [
      { key: "tableName", label: "Tên bảng", defaultValue: "users", type: "table" },
      { key: "columnName", label: "Tên cột mới", defaultValue: "phone_number", type: "text" },
      { key: "columnType", label: "Kiểu dữ liệu & Mặc định", defaultValue: "VARCHAR(20) DEFAULT NULL", type: "text" },
    ],
  },
  {
    id: "create-view",
    name: "CREATE OR REPLACE VIEW (Khung nhìn)",
    category: "ddl",
    description: "Tạo view tái sử dụng cho các câu truy vấn phức tạp",
    sql: `CREATE OR REPLACE VIEW {{viewName}} AS\nSELECT\n  c.id,\n  c.name,\n  c.email,\n  COUNT(o.id) AS total_orders\nFROM\n  customers c\nLEFT JOIN\n  orders o ON o.customer_id = c.id\nWHERE\n  c.status = 'active'\nGROUP BY\n  c.id, c.name, c.email;`,
    params: [
      { key: "viewName", label: "Tên View", defaultValue: "v_active_customers_summary", type: "text" },
    ],
  },

  // --- Giao dịch & Tối ưu ---
  {
    id: "txn-safe",
    name: "TRANSACTION An toàn (BEGIN ... COMMIT ... ROLLBACK)",
    category: "transaction",
    description: "Khối giao dịch đảm bảo toàn vẹn dữ liệu chuẩn ACID",
    sql: `BEGIN;\n\n-- Bước 1: Trừ tiền tài khoản A\nUPDATE accounts\nSET balance = balance - 100\nWHERE id = 1 AND balance >= 100;\n\n-- Bước 2: Cộng tiền tài khoản B\nUPDATE accounts\nSET balance = balance + 100\nWHERE id = 2;\n\n-- Xác nhận nếu thành công, hủy bỏ (ROLLBACK) nếu có lỗi\nCOMMIT;\n-- ROLLBACK;`,
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

export interface SqlTemplatesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsert: (sql: string) => void;
  tables?: string[];
  activeTable?: string | null;
}

export function SqlTemplatesModal({
  isOpen,
  onClose,
  onInsert,
  tables = [],
  activeTable,
}: SqlTemplatesModalProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Expanded parameter panels: Record<tmplId, boolean>
  const [openParamPanels, setOpenParamPanels] = useState<Record<string, boolean>>({});

  // Transient drafts: Record<tmplId, Record<paramKey, string>>
  // Never written to persistent storage, resets on close so original templates are ALWAYS preserved.
  const [customParams, setCustomParams] = useState<Record<string, Record<string, string>>>({});

  // Reset drafts whenever modal is closed or opened so original templates are 100% pristine
  useEffect(() => {
    if (!isOpen) {
      setCustomParams({});
      setOpenParamPanels({});
      setSearch("");
    }
  }, [isOpen]);

  const filteredTemplates = useMemo(() => {
    return DEFAULT_TEMPLATES.filter((tmpl) => {
      const matchCat = selectedCategory === "all" || tmpl.category === selectedCategory;
      const term = search.trim().toLowerCase();
      const matchSearch =
        !term ||
        tmpl.name.toLowerCase().includes(term) ||
        tmpl.description.toLowerCase().includes(term) ||
        tmpl.sql.toLowerCase().includes(term);
      return matchCat && matchSearch;
    });
  }, [search, selectedCategory]);

  const toggleParams = (id: string) => {
    setOpenParamPanels((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const handleParamChange = (tmplId: string, paramKey: string, value: string) => {
    setCustomParams((prev) => ({
      ...prev,
      [tmplId]: {
        ...(prev[tmplId] || {}),
        [paramKey]: value,
      },
    }));
  };

  const handleReset = (tmplId: string) => {
    setCustomParams((prev) => {
      const next = { ...prev };
      delete next[tmplId];
      return next;
    });
  };

  const handleCopy = async (tmpl: SqlTemplate) => {
    const finalSql = resolveSql(tmpl, customParams[tmpl.id], activeTable);
    await copyTextToClipboard(finalSql);
    setCopiedId(tmpl.id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="bg-elevated border border-strong rounded-xl shadow-2xl w-[760px] max-w-[95vw] max-h-[88vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-default bg-base flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-amber-500/15 text-amber-400 rounded-lg">
              <Zap size={18} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-primary">
                {t("editor.sqlTemplates.title", { defaultValue: "Mẫu SQL & Snippets (Ctrl+J)" })}
              </h2>
              <p className="text-xs text-muted">
                {t("editor.sqlTemplates.subtitle", {
                  defaultValue: "Chọn mẫu SQL dựng sẵn, điền nhanh tham số hoặc chèn trực tiếp vào trình soạn thảo.",
                })}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-muted hover:text-primary hover:bg-surface-secondary transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Search & Category Filter */}
        <div className="p-4 border-b border-default bg-surface-secondary/40 flex flex-col gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="text"
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("editor.sqlTemplates.searchPlaceholder", {
                defaultValue: "Tìm kiếm mẫu (SELECT, JOIN, WHERE, INSERT, CTE, CREATE TABLE...)",
              })}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-surface-secondary border border-strong rounded-lg text-primary placeholder:text-muted focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-thin">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                  selectedCategory === cat.id
                    ? "bg-blue-600 text-white shadow-sm"
                    : "bg-surface-secondary text-secondary hover:text-primary hover:bg-surface-tertiary"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Templates List */}
        <div className="p-4 flex-1 overflow-y-auto space-y-3.5 select-text">
          {filteredTemplates.length === 0 ? (
            <div className="text-center py-8 text-xs text-muted italic">
              {t("editor.sqlTemplates.empty", { defaultValue: "Không tìm thấy mẫu SQL nào phù hợp." })}
            </div>
          ) : (
            filteredTemplates.map((tmpl) => {
              const tmplDrafts = customParams[tmpl.id] || {};
              const isCustomized = Boolean(
                Object.keys(tmplDrafts).length > 0 &&
                Object.values(tmplDrafts).some((v) => v !== "" && v !== undefined)
              );
              const isParamsOpen = Boolean(openParamPanels[tmpl.id]);
              const resolvedSql = resolveSql(tmpl, customParams[tmpl.id], activeTable);
              const categoryObj = CATEGORIES.find((c) => c.id === tmpl.category);

              return (
                <div
                  key={tmpl.id}
                  className="group p-3.5 rounded-xl border border-default bg-base hover:border-blue-500/40 hover:bg-surface-secondary/20 transition-all flex flex-col gap-3 shadow-sm"
                >
                  {/* Card Header & Actions */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-xs font-bold text-primary group-hover:text-blue-400 transition-colors">
                          {tmpl.name}
                        </h4>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-secondary text-muted font-medium border border-default/50">
                          {categoryObj ? categoryObj.label : tmpl.category}
                        </span>
                        {isCustomized && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 font-semibold border border-amber-500/30 flex items-center gap-1">
                            <Sparkles size={10} />
                            Đã tùy biến
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted mt-0.5">{tmpl.description}</p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {tmpl.params && tmpl.params.length > 0 && (
                        <button
                          onClick={() => toggleParams(tmpl.id)}
                          className={`px-2 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1 border ${
                            isParamsOpen
                              ? "bg-blue-600/15 text-blue-400 border-blue-500/40"
                              : "bg-surface-secondary hover:bg-surface-tertiary text-secondary hover:text-primary border-default/60"
                          }`}
                          title="Điền nhanh tham số (Tên bảng, cột, điều kiện...)"
                        >
                          <SlidersHorizontal size={12} />
                          <span>{isParamsOpen ? "Thu gọn" : "Điền tham số"}</span>
                        </button>
                      )}

                      {isCustomized && (
                        <button
                          onClick={() => handleReset(tmpl.id)}
                          className="p-1.5 rounded bg-surface-secondary hover:bg-surface-tertiary text-muted hover:text-amber-400 text-xs transition-colors flex items-center gap-1 border border-default/60"
                          title="Khôi phục mẫu gốc mặc định"
                        >
                          <RotateCcw size={12} />
                        </button>
                      )}

                      <button
                        onClick={() => handleCopy(tmpl)}
                        className="p-1.5 rounded bg-surface-secondary hover:bg-surface-tertiary text-secondary hover:text-primary text-xs transition-colors flex items-center gap-1 border border-default/60"
                        title="Sao chép SQL"
                      >
                        {copiedId === tmpl.id ? (
                          <>
                            <Check size={12} className="text-emerald-400" />
                            <span className="text-[10px] text-emerald-400 font-medium">Đã chép</span>
                          </>
                        ) : (
                          <Copy size={12} />
                        )}
                      </button>

                      <button
                        onClick={() => {
                          onInsert(resolvedSql);
                          onClose();
                        }}
                        className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors flex items-center gap-1 shadow-sm"
                        title="Chèn câu lệnh SQL này vào vị trí con trỏ trong Editor"
                      >
                        <span>Chèn vào code</span>
                        <ArrowRight size={12} />
                      </button>
                    </div>
                  </div>

                  {/* Interactive Parameter Customization Form */}
                  {isParamsOpen && tmpl.params && (
                    <div className="p-3 bg-surface-secondary/70 border border-blue-500/20 rounded-lg flex flex-col gap-2.5 transition-all text-xs">
                      <div className="flex items-center justify-between text-[11px] font-semibold text-primary border-b border-default/40 pb-1.5">
                        <span className="flex items-center gap-1 text-blue-400">
                          <SlidersHorizontal size={11} />
                          Tùy biến nhanh giá trị mẫu:
                        </span>
                        {isCustomized && (
                          <button
                            onClick={() => handleReset(tmpl.id)}
                            className="text-muted hover:text-amber-400 text-[10px] flex items-center gap-1 transition-colors"
                          >
                            <RotateCcw size={10} />
                            Khôi phục mặc định
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {tmpl.params.map((param) => {
                          const val = tmplDrafts[param.key] ?? "";
                          if (param.type === "multiline") {
                            return (
                              <div key={param.key} className="col-span-full flex flex-col gap-1">
                                <label className="text-[11px] font-medium text-secondary">
                                  {param.label}:
                                </label>
                                <textarea
                                  rows={4}
                                  value={val || param.defaultValue}
                                  onChange={(e) =>
                                    handleParamChange(tmpl.id, param.key, e.target.value)
                                  }
                                  className="w-full px-2.5 py-1.5 bg-base border border-default rounded text-[11px] font-mono text-primary placeholder:text-muted/60 focus:outline-none focus:border-blue-500 resize-y"
                                />
                              </div>
                            );
                          }

                          return (
                            <div key={param.key} className="flex flex-col gap-1">
                              <label className="text-[11px] font-medium text-secondary">
                                {param.label}:
                              </label>
                              <div className="relative">
                                <input
                                  type="text"
                                  list={param.type === "table" ? `db-tables-${tmpl.id}` : undefined}
                                  value={val}
                                  placeholder={
                                    param.type === "table" && activeTable && param.key === "tableName"
                                      ? activeTable
                                      : param.defaultValue
                                  }
                                  onChange={(e) =>
                                    handleParamChange(tmpl.id, param.key, e.target.value)
                                  }
                                  className="w-full px-2.5 py-1 bg-base border border-default rounded text-[11px] text-primary placeholder:text-muted/60 focus:outline-none focus:border-blue-500 font-mono"
                                />
                                {param.type === "table" && tables.length > 0 && (
                                  <datalist id={`db-tables-${tmpl.id}`}>
                                    {tables.map((tbl) => (
                                      <option key={tbl} value={tbl} />
                                    ))}
                                  </datalist>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* SQL Preview Box with Selectable & Copyable Text */}
                  <div className="relative">
                    <pre className="p-3 bg-surface-secondary/90 rounded-lg border border-default/60 text-[11px] font-mono text-secondary overflow-x-auto whitespace-pre selection:bg-blue-500/30 select-text cursor-text">
                      {resolvedSql}
                    </pre>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </Modal>
  );
}
