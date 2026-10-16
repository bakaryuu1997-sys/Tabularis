import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Search, Zap, Copy, Check, X, ArrowRight } from "lucide-react";
import { Modal } from "../ui/Modal";
import { copyTextToClipboard } from "../../utils/clipboard";

export interface SqlTemplate {
  id: string;
  name: string;
  category: "select" | "dml" | "advanced" | "ddl";
  description: string;
  sql: string;
}

const DEFAULT_TEMPLATES: SqlTemplate[] = [
  {
    id: "sel-from-where",
    name: "SELECT ... FROM ... WHERE",
    category: "select",
    description: "Truy vấn chọn dữ liệu cơ bản có điều kiện lọc",
    sql: `SELECT\n  *\nFROM\n  table_name\nWHERE\n  condition = 'value';`,
  },
  {
    id: "sel-join",
    name: "SELECT ... JOIN ... ON ... WHERE",
    category: "select",
    description: "Kết nối 2 bảng dựa trên khóa ngoại và điều kiện lọc",
    sql: `SELECT\n  a.id,\n  a.name,\n  b.detail\nFROM\n  table_a a\nJOIN\n  table_b b ON b.a_id = a.id\nWHERE\n  a.status = 'active';`,
  },
  {
    id: "sel-left-join",
    name: "SELECT ... LEFT JOIN ... ON",
    category: "select",
    description: "Kết nối bảng giữ nguyên toàn bộ dòng bảng bên trái",
    sql: `SELECT\n  a.*,\n  b.extra_info\nFROM\n  table_a a\nLEFT JOIN\n  table_b b ON b.a_id = a.id;`,
  },
  {
    id: "sel-group-having",
    name: "SELECT ... GROUP BY ... HAVING ... ORDER BY",
    category: "select",
    description: "Gom nhóm thống kê, lọc trên nhóm và sắp xếp kết quả",
    sql: `SELECT\n  category_id,\n  COUNT(*) AS total_items,\n  SUM(amount) AS total_amount\nFROM\n  orders\nGROUP BY\n  category_id\nHAVING\n  COUNT(*) > 5\nORDER BY\n  total_amount DESC;`,
  },
  {
    id: "sel-pagination",
    name: "SELECT ... LIMIT / OFFSET (Phân trang)",
    category: "select",
    description: "Truy vấn phân trang dữ liệu theo kích thước trang",
    sql: `SELECT\n  *\nFROM\n  table_name\nORDER BY\n  id DESC\nLIMIT 50 OFFSET 0;`,
  },
  {
    id: "sel-count",
    name: "SELECT COUNT(*)",
    category: "select",
    description: "Đếm nhanh tổng số dòng trong bảng",
    sql: `SELECT COUNT(*) AS total_count FROM table_name;`,
  },
  {
    id: "ins-values",
    name: "INSERT INTO ... VALUES (...)",
    category: "dml",
    description: "Thêm một hoặc nhiều dòng dữ liệu mới vào bảng",
    sql: `INSERT INTO table_name (col1, col2, col3)\nVALUES\n  ('val1', 'val2', 100);`,
  },
  {
    id: "upd-where",
    name: "UPDATE ... SET ... WHERE",
    category: "dml",
    description: "Cập nhật dữ liệu an toàn có điều kiện WHERE",
    sql: `UPDATE table_name\nSET\n  status = 'completed',\n  updated_at = CURRENT_TIMESTAMP\nWHERE\n  id = 1;`,
  },
  {
    id: "del-where",
    name: "DELETE FROM ... WHERE",
    category: "dml",
    description: "Xóa dòng dữ liệu an toàn có điều kiện WHERE",
    sql: `DELETE FROM table_name\nWHERE\n  id = 1;`,
  },
  {
    id: "cte-with",
    name: "CTE (WITH ... AS)",
    category: "advanced",
    description: "Mệnh đề bảng tạm CTE giúp query phức tạp trở nên mạch lạc",
    sql: `WITH filtered_data AS (\n  SELECT\n    user_id,\n    SUM(amount) AS total\n  FROM\n    orders\n  WHERE\n    created_at >= '2026-01-01'\n  GROUP BY\n    user_id\n)\nSELECT\n  u.name,\n  f.total\nFROM\n  filtered_data f\nJOIN\n  users u ON u.id = f.user_id\nORDER BY\n  f.total DESC;`,
  },
  {
    id: "case-when",
    name: "CASE WHEN ... THEN ... ELSE ... END",
    category: "advanced",
    description: "Biểu thức rẽ nhánh có điều kiện trong SELECT",
    sql: `SELECT\n  id,\n  amount,\n  CASE\n    WHEN amount >= 1000 THEN 'VIP'\n    WHEN amount >= 500 THEN 'Standard'\n    ELSE 'Bronze'\n  END AS customer_tier\nFROM\n  orders;`,
  },
  {
    id: "create-table",
    name: "CREATE TABLE",
    category: "ddl",
    description: "Tạo cấu trúc bảng mới chuẩn SQL",
    sql: `CREATE TABLE new_table (\n  id SERIAL PRIMARY KEY,\n  name VARCHAR(255) NOT NULL,\n  status VARCHAR(50) DEFAULT 'active',\n  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP\n);`,
  },
];

export interface SqlTemplatesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsert: (sql: string) => void;
}

export function SqlTemplatesModal({
  isOpen,
  onClose,
  onInsert,
}: SqlTemplatesModalProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);

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

  const handleCopy = async (tmpl: SqlTemplate) => {
    await copyTextToClipboard(tmpl.sql);
    setCopiedId(tmpl.id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="bg-elevated border border-strong rounded-xl shadow-2xl w-[640px] max-w-[95vw] max-h-[85vh] flex flex-col overflow-hidden">
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
                  defaultValue: "Chọn mẫu SQL dựng sẵn để chèn trực tiếp vào trình soạn thảo.",
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
                defaultValue: "Tìm kiếm mẫu (SELECT, JOIN, WHERE, INSERT...)",
              })}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-surface-secondary border border-strong rounded-lg text-primary placeholder:text-muted focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
            {[
              { id: "all", label: "Tất cả" },
              { id: "select", label: "SELECT & Bộ lọc" },
              { id: "dml", label: "INSERT / UPDATE / DELETE" },
              { id: "advanced", label: "CTE & Nâng cao" },
              { id: "ddl", label: "Tạo bảng DDL" },
            ].map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                  selectedCategory === cat.id
                    ? "bg-blue-600 text-white"
                    : "bg-surface-secondary text-secondary hover:text-primary hover:bg-surface-tertiary"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Templates List */}
        <div className="p-4 flex-1 overflow-y-auto space-y-3">
          {filteredTemplates.length === 0 ? (
            <div className="text-center py-8 text-xs text-muted italic">
              {t("editor.sqlTemplates.empty", { defaultValue: "Không tìm thấy mẫu SQL nào phù hợp." })}
            </div>
          ) : (
            filteredTemplates.map((tmpl) => (
              <div
                key={tmpl.id}
                className="group p-3 rounded-lg border border-default bg-base hover:border-blue-500/50 hover:bg-surface-secondary/30 transition-all flex flex-col gap-2"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="text-xs font-bold text-primary group-hover:text-blue-400 transition-colors">
                      {tmpl.name}
                    </h4>
                    <p className="text-[11px] text-muted mt-0.5">{tmpl.description}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => handleCopy(tmpl)}
                      className="p-1.5 rounded bg-surface-secondary hover:bg-surface-tertiary text-secondary hover:text-primary text-xs transition-colors flex items-center gap-1"
                      title="Sao chép SQL"
                    >
                      {copiedId === tmpl.id ? (
                        <>
                          <Check size={12} className="text-emerald-400" />
                          <span className="text-[10px] text-emerald-400">Đã chép</span>
                        </>
                      ) : (
                        <Copy size={12} />
                      )}
                    </button>
                    <button
                      onClick={() => {
                        onInsert(tmpl.sql);
                        onClose();
                      }}
                      className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors flex items-center gap-1 shadow-sm"
                    >
                      <span>Chèn vào code</span>
                      <ArrowRight size={12} />
                    </button>
                  </div>
                </div>

                <pre className="p-2.5 bg-surface-secondary rounded border border-default/50 text-[11px] font-mono text-secondary overflow-x-auto whitespace-pre">
                  {tmpl.sql}
                </pre>
              </div>
            ))
          )}
        </div>
      </div>
    </Modal>
  );
}
