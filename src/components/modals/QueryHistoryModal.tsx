import { useState, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  History,
  X,
  Search,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  CornerDownLeft,
  Play,
  Trash2,
  Clock,
  Database,
  Layers,
} from "lucide-react";
import { useQueryHistory } from "../../hooks/useQueryHistory";
import { copyTextToClipboard } from "../../utils/clipboard";

export interface QueryHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertQuery: (sql: string) => void;
  onRunQuery: (sql: string) => void;
}

export function QueryHistoryModal({
  isOpen,
  onClose,
  onInsertQuery,
  onRunQuery,
}: QueryHistoryModalProps) {
  const { t } = useTranslation();
  const { entries, deleteEntry, clearHistory } = useQueryHistory();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "success" | "error">("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Filter entries
  const filteredEntries = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return entries.filter((item) => {
      if (filterStatus === "success" && item.status !== "success") return false;
      if (filterStatus === "error" && item.status !== "error") return false;
      if (!q) return true;
      return (
        item.sql.toLowerCase().includes(q) ||
        (item.database && item.database.toLowerCase().includes(q)) ||
        (item.error && item.error.toLowerCase().includes(q))
      );
    });
  }, [entries, searchQuery, filterStatus]);

  if (!isOpen) return null;

  const handleCopy = async (id: string, sql: string) => {
    await copyTextToClipboard(sql);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      return isoString;
    }
  };

  const formatDate = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString([], {
        month: "short",
        day: "numeric",
      });
    } catch {
      return "";
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl max-h-[88vh] bg-surface-primary border border-default rounded-xl shadow-2xl flex flex-col overflow-hidden animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-default bg-surface-secondary/40 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-400">
              <History size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-primary">
                  {t("queryHistory.title", { defaultValue: "Lịch sử truy vấn SQL" })}
                </h2>
                <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-purple-900/30 text-purple-300 border border-purple-800/40">
                  Ctrl+H
                </span>
                <span className="text-xs text-muted">
                  ({filteredEntries.length} / {entries.length})
                </span>
              </div>
              <p className="text-xs text-muted mt-0.5">
                Tìm kiếm, chép lại hoặc chạy ngay các câu lệnh SQL đã thực thi
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {entries.length > 0 && (
              confirmClear ? (
                <div className="flex items-center gap-1.5 bg-red-950/40 border border-red-800/50 rounded px-2 py-1">
                  <span className="text-xs text-red-300">Xác nhận xóa?</span>
                  <button
                    onClick={async () => {
                      await clearHistory();
                      setConfirmClear(false);
                    }}
                    className="text-xs px-2 py-0.5 bg-red-600 hover:bg-red-500 text-white rounded font-medium"
                  >
                    Xóa hết
                  </button>
                  <button
                    onClick={() => setConfirmClear(false)}
                    className="text-xs px-1.5 py-0.5 hover:text-white text-muted"
                  >
                    Hủy
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmClear(true)}
                  className="flex items-center gap-1 text-xs text-muted hover:text-red-400 p-1.5 rounded hover:bg-surface-secondary transition-colors"
                  title="Xóa toàn bộ lịch sử"
                >
                  <Trash2 size={14} />
                  <span>Xóa lịch sử</span>
                </button>
              )
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-muted hover:text-primary hover:bg-surface-secondary transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="px-6 py-3 border-b border-default bg-surface flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="relative flex-1 min-w-[240px]">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              type="text"
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm theo lệnh SQL, tên bảng, database..."
              className="w-full pl-9 pr-3 py-1.5 bg-surface-secondary border border-strong rounded-lg text-xs text-primary placeholder-muted focus:outline-none focus:ring-1 focus:ring-purple-500"
            />
          </div>

          <div className="flex items-center gap-1 bg-surface-secondary rounded-lg p-0.5 text-xs">
            <button
              onClick={() => setFilterStatus("all")}
              className={`px-3 py-1 rounded-md font-medium transition-colors ${
                filterStatus === "all"
                  ? "bg-purple-600 text-white shadow-sm"
                  : "text-muted hover:text-primary"
              }`}
            >
              Tất cả ({entries.length})
            </button>
            <button
              onClick={() => setFilterStatus("success")}
              className={`px-3 py-1 rounded-md font-medium transition-colors ${
                filterStatus === "success"
                  ? "bg-purple-600 text-white shadow-sm"
                  : "text-muted hover:text-primary"
              }`}
            >
              Thành công
            </button>
            <button
              onClick={() => setFilterStatus("error")}
              className={`px-3 py-1 rounded-md font-medium transition-colors ${
                filterStatus === "error"
                  ? "bg-purple-600 text-white shadow-sm"
                  : "text-muted hover:text-primary"
              }`}
            >
              Lỗi
            </button>
          </div>
        </div>

        {/* Entries List */}
        <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-3">
          {filteredEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center text-muted">
              <History size={40} className="stroke-1 text-muted/40 mb-3" />
              <p className="text-sm font-medium text-secondary">
                {searchQuery
                  ? "Không tìm thấy câu truy vấn phù hợp"
                  : "Chưa có lịch sử câu lệnh nào được lưu"}
              </p>
              <p className="text-xs text-muted mt-1 max-w-sm">
                Khi bạn thực thi câu lệnh SQL trong Console hoặc mở bảng, lịch sử sẽ tự động được ghi lại tại đây.
              </p>
            </div>
          ) : (
            filteredEntries.map((item) => (
              <div
                key={item.id}
                className="group p-4 bg-surface-secondary/70 hover:bg-surface-secondary border border-strong hover:border-purple-500/40 rounded-xl transition-all shadow-sm flex flex-col gap-2.5"
              >
                {/* Item Top Meta */}
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    {item.status === "success" ? (
                      <span className="flex items-center gap-1 text-emerald-400 font-medium">
                        <CheckCircle2 size={13} />
                        <span>Thành công</span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-red-400 font-medium">
                        <AlertCircle size={13} />
                        <span>Lỗi</span>
                      </span>
                    )}

                    {item.database && (
                      <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-surface-tertiary text-muted font-mono text-[11px]">
                        <Database size={11} />
                        <span>{item.database}</span>
                      </span>
                    )}

                    {item.executionTimeMs !== null && (
                      <span className="flex items-center gap-1 text-muted font-mono text-[11px]">
                        <Clock size={11} />
                        <span>{item.executionTimeMs}ms</span>
                      </span>
                    )}

                    {item.rowsAffected !== null && item.rowsAffected > 0 && (
                      <span className="flex items-center gap-1 text-muted text-[11px]">
                        <Layers size={11} />
                        <span>{item.rowsAffected} dòng ảnh hưởng</span>
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3 text-muted text-[11px]">
                    <span>
                      {formatDate(item.executedAt)} {formatTime(item.executedAt)}
                    </span>
                    <button
                      onClick={() => deleteEntry(item.id)}
                      className="opacity-0 group-hover:opacity-100 hover:text-red-400 p-0.5 rounded transition-all"
                      title="Xóa mục này"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>

                {/* SQL Code Box */}
                <div className="relative bg-surface p-3 rounded-lg border border-default overflow-x-auto font-mono text-xs text-primary leading-relaxed">
                  <pre className="whitespace-pre-wrap break-all">{item.sql}</pre>
                </div>

                {/* Error Banner if any */}
                {item.error && (
                  <div className="text-xs text-red-400 bg-red-950/20 border border-red-900/30 rounded px-2.5 py-1.5 font-mono">
                    {item.error}
                  </div>
                )}

                {/* Quick Action Buttons */}
                <div className="flex items-center justify-end gap-2 pt-1 border-t border-strong/40">
                  <button
                    onClick={() => handleCopy(item.id, item.sql)}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-surface hover:bg-surface-tertiary border border-strong text-xs text-secondary hover:text-primary transition-colors"
                  >
                    {copiedId === item.id ? (
                      <>
                        <Check size={12} className="text-green-400" />
                        <span className="text-green-400">Đã chép</span>
                      </>
                    ) : (
                      <>
                        <Copy size={12} />
                        <span>Sao chép</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => {
                      onInsertQuery(item.sql);
                      onClose();
                    }}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-surface hover:bg-surface-tertiary border border-strong text-xs text-secondary hover:text-primary transition-colors"
                    title="Chèn câu lệnh này vào vị trí con trỏ trong Editor"
                  >
                    <CornerDownLeft size={12} />
                    <span>Chèn vào Editor</span>
                  </button>

                  <button
                    onClick={() => {
                      onRunQuery(item.sql);
                      onClose();
                    }}
                    className="flex items-center gap-1.5 px-3 py-1 rounded bg-purple-600 hover:bg-purple-500 text-xs font-medium text-white transition-colors"
                    title="Chạy ngay câu lệnh này"
                  >
                    <Play size={12} fill="currentColor" />
                    <span>Chạy ngay</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
