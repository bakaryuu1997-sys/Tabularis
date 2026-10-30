import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  X,
  Check,
  CheckSquare,
  Square,
  FolderOpen,
  Loader2,
  FileCode,
} from "lucide-react";
import { Modal } from "../ui/Modal";
import type { DetectedConnection } from "../../utils/projectScanner";
import { invoke } from "@tauri-apps/api/core";
import { useAlert } from "../../hooks/useAlert";

interface ProjectImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  connections: DetectedConnection[];
  sourceTitle?: string;
  onImportSuccess?: () => void;
}

export function ProjectImportModal({
  isOpen,
  onClose,
  connections,
  sourceTitle,
  onImportSuccess,
}: ProjectImportModalProps) {
  const { t } = useTranslation();
  const { showAlert } = useAlert();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(connections.map((c) => c.id)),
  );
  const [customNames, setCustomNames] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const c of connections) {
      map[c.id] = c.name;
    }
    return map;
  });
  const [isImporting, setIsImporting] = useState(false);

  if (!isOpen) return null;

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === connections.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(connections.map((c) => c.id)));
    }
  };

  const handleImport = async () => {
    const toImport = connections.filter((c) => selectedIds.has(c.id));
    if (toImport.length === 0) return;

    setIsImporting(true);
    let successCount = 0;

    try {
      for (const item of toImport) {
        const connName = customNames[item.id] || item.name;
        const params: Record<string, unknown> = {
          driver: item.driver,
          database: item.database,
        };
        if (item.host) params.host = item.host;
        if (item.port) params.port = item.port;
        if (item.username) params.username = item.username;
        if (item.password) params.password = item.password;

        await invoke("save_connection", {
          name: connName,
          params,
          detectJsonInTextColumns: null,
        });
        successCount++;
      }

      showAlert(
        t("projectScanner.importSuccess", {
          defaultValue: `Đã nhập thành công ${successCount} kết nối vào Tabularis!`,
          count: successCount,
        }),
        { kind: "info" },
      );

      if (onImportSuccess) onImportSuccess();
      onClose();
    } catch (err) {
      showAlert(
        t("projectScanner.importError", {
          defaultValue: `Có lỗi khi lưu kết nối: ${String(err)}`,
        }),
        { kind: "error" },
      );
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="bg-elevated border border-default rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-fade-in text-primary">
        {/* Header */}
        <div className="px-6 py-4 border-b border-default bg-base/50 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 text-blue-400 rounded-xl border border-blue-500/20">
              <FolderOpen size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-primary">
                {sourceTitle || t("projectScanner.modalTitle", { defaultValue: "Nhập kết nối từ dự án" })}
              </h2>
              <p className="text-xs text-muted mt-0.5">
                {t("projectScanner.foundCount", {
                  defaultValue: `Tìm thấy ${connections.length} kết nối sẵn sàng thêm vào danh sách kết nối.`,
                  count: connections.length,
                })}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-muted hover:text-primary hover:bg-surface-secondary transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Action bar */}
        <div className="px-6 py-2.5 bg-surface-secondary/40 border-b border-default flex items-center justify-between text-xs text-secondary shrink-0">
          <button
            onClick={toggleAll}
            className="flex items-center gap-1.5 hover:text-primary transition-colors font-medium"
          >
            {selectedIds.size === connections.length ? (
              <CheckSquare size={14} className="text-blue-400" />
            ) : (
              <Square size={14} className="text-muted" />
            )}
            <span>
              {selectedIds.size === connections.length
                ? t("common.deselectAll", { defaultValue: "Bỏ chọn tất cả" })
                : t("common.selectAll", { defaultValue: "Chọn tất cả" })}
            </span>
          </button>
          <span className="text-muted">
            {t("projectScanner.selectedCount", {
              defaultValue: `Đã chọn: ${selectedIds.size} / ${connections.length}`,
              selected: selectedIds.size,
              total: connections.length,
            })}
          </span>
        </div>

        {/* Connection List */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {connections.map((conn) => {
            const isSelected = selectedIds.has(conn.id);
            return (
              <div
                key={conn.id}
                onClick={() => toggleSelect(conn.id)}
                className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col gap-2 ${
                  isSelected
                    ? "bg-blue-600/10 border-blue-500/40 shadow-xs"
                    : "bg-base/40 border-default/70 hover:border-strong opacity-80"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSelect(conn.id);
                      }}
                      className="text-muted hover:text-primary transition-colors shrink-0"
                    >
                      {isSelected ? (
                        <CheckSquare size={16} className="text-blue-400" />
                      ) : (
                        <Square size={16} className="text-muted" />
                      )}
                    </button>

                    <input
                      type="text"
                      value={customNames[conn.id] || conn.name}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCustomNames((prev) => ({ ...prev, [conn.id]: val }));
                      }}
                      onClick={(e) => e.stopPropagation()}
                      placeholder="Tên kết nối"
                      className="bg-transparent border-b border-transparent hover:border-default focus:border-blue-500 font-semibold text-sm text-primary px-1 py-0.5 rounded outline-none flex-1 truncate transition-colors"
                    />
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        conn.driver === "postgres"
                          ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                          : conn.driver === "mysql"
                            ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                            : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                      }`}
                    >
                      {conn.driver}
                    </span>
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-surface-secondary text-muted border border-default">
                      <FileCode size={10} />
                      <span className="truncate max-w-[130px]">{conn.sourceFile}</span>
                    </span>
                  </div>
                </div>

                <div className="pl-6 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted font-mono">
                  {conn.host && (
                    <span className="flex items-center gap-1">
                      <span className="text-secondary">Host:</span>
                      <span>{conn.host}:{conn.port}</span>
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <span className="text-secondary">Database:</span>
                    <span className="text-primary font-semibold">{conn.database}</span>
                  </span>
                  {conn.username && (
                    <span className="flex items-center gap-1">
                      <span className="text-secondary">User:</span>
                      <span>{conn.username}</span>
                    </span>
                  )}
                  {conn.password && (
                    <span className="text-emerald-400/80 text-[10px] font-sans font-medium">
                      ✓ Đã nhận mật khẩu
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-default bg-base/60 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isImporting}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-secondary hover:text-primary hover:bg-surface-secondary transition-colors"
          >
            {t("common.cancel", { defaultValue: "Hủy" })}
          </button>

          <button
            type="button"
            onClick={handleImport}
            disabled={selectedIds.size === 0 || isImporting}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl font-semibold text-xs transition-all shadow-lg shadow-blue-500/20 disabled:opacity-40 disabled:cursor-not-allowed hover:-translate-y-px"
          >
            {isImporting ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                <span>Đang nhập...</span>
              </>
            ) : (
              <>
                <Check size={14} />
                <span>
                  {t("projectScanner.confirmImport", {
                    defaultValue: `Thêm ${selectedIds.size} kết nối vào Tabularis`,
                    count: selectedIds.size,
                  })}
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
