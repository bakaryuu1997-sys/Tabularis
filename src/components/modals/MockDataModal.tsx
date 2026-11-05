import { useState, useEffect, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  X,
  Sparkles,
  Loader2,
  Copy,
  Check,
  FileCode,
  Database,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { Modal } from "../ui/Modal";
import { useDatabase } from "../../hooks/useDatabase";
import { useAlert } from "../../hooks/useAlert";
import {
  generateMockRows,
  generateMockInsertSql,
} from "../../utils/mockDataGenerator";
import type { TableColumn } from "../../utils/sqlGenerator";

interface MockDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  tableName: string;
  schema?: string;
  connectionId?: string;
  onOpenInEditor?: (sql: string) => void;
  onSuccess?: () => void;
}

export const MockDataModal = ({
  isOpen,
  onClose,
  tableName,
  schema,
  connectionId,
  onOpenInEditor,
  onSuccess,
}: MockDataModalProps) => {
  const { t } = useTranslation();
  const { showAlert } = useAlert();
  const { activeConnectionId, activeSchema, activeCapabilities } = useDatabase();

  const resolvedConnectionId = connectionId ?? activeConnectionId;
  const resolvedSchema = schema ?? activeSchema ?? undefined;

  const [columns, setColumns] = useState<TableColumn[]>([]);
  const [isLoadingCols, setIsLoadingCols] = useState(false);
  const [rowCount, setRowCount] = useState<number>(10);
  const [isInserting, setIsInserting] = useState(false);
  const [copied, setCopied] = useState(false);

  // Load columns
  const loadColumns = useCallback(async () => {
    if (!resolvedConnectionId || !tableName) return;
    setIsLoadingCols(true);
    try {
      const cols = await invoke<TableColumn[]>("get_columns", {
        connectionId: resolvedConnectionId,
        tableName,
        ...(resolvedSchema ? { schema: resolvedSchema } : {}),
      });
      setColumns(cols);
    } catch (err) {
      console.error("Failed to load columns for mock data generator:", err);
      showAlert(t("mockData.loadError"), {
        kind: "error",
      });
    } finally {
      setIsLoadingCols(false);
    }
  }, [resolvedConnectionId, tableName, resolvedSchema, showAlert, t]);

  useEffect(() => {
    if (isOpen) {
      void loadColumns();
    }
  }, [isOpen, loadColumns]);

  // Generate mock rows
  const mockRows = useMemo(() => {
    if (columns.length === 0) return [];
    return generateMockRows(columns, rowCount);
  }, [columns, rowCount]);

  const insertSql = useMemo(() => {
    if (columns.length === 0 || mockRows.length === 0) return "";
    const dialect = activeCapabilities?.sql_dialect || "postgres";
    const fullTableName = resolvedSchema ? `${resolvedSchema}.${tableName}` : tableName;
    return generateMockInsertSql(fullTableName, columns, mockRows, dialect);
  }, [columns, mockRows, activeCapabilities?.sql_dialect, resolvedSchema, tableName]);

  const handleCopySql = async () => {
    if (!insertSql) return;
    await navigator.clipboard.writeText(insertSql);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenEditor = () => {
    if (!insertSql) return;
    if (onOpenInEditor) {
      onOpenInEditor(insertSql);
    } else {
      window.dispatchEvent(
        new CustomEvent("tabularis:new-console-with-query", {
          detail: { query: insertSql, title: `Mock ${tableName}` },
        }),
      );
    }
    onClose();
  };

  const handleInsertDirectly = async () => {
    if (!resolvedConnectionId || !insertSql) return;
    setIsInserting(true);
    try {
      await invoke("execute_query", {
        connectionId: resolvedConnectionId,
        query: insertSql,
        ...(resolvedSchema ? { schema: resolvedSchema } : {}),
      });
      showAlert(
        t("mockData.insertSuccess", {
          count: rowCount,
          table: tableName,
        }),
        { kind: "info" },
      );
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      console.error("Failed to insert mock data:", err);
      showAlert(
        `${t("mockData.insertFailure")}: ${String(err)}`,
        { kind: "error" },
      );
    } finally {
      setIsInserting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="bg-elevated border border-strong rounded-xl shadow-2xl w-[720px] max-h-[85vh] overflow-hidden flex flex-col font-sans">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-default bg-base shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-pink-500/10 text-pink-400 border border-pink-500/20">
              <Sparkles size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-primary">
                  {t("mockData.title")}
                </h2>
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-surface border border-default text-primary">
                  {tableName}
                </span>
              </div>
              <p className="text-xs text-muted">
                {t("mockData.subtitle")}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-secondary hover:text-primary transition-colors p-1 rounded-md"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-4">
          {isLoadingCols ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-secondary text-sm">
              <Loader2 size={24} className="animate-spin text-primary" />
              <span>{t("mockData.loadingCols")}</span>
            </div>
          ) : (
            <>
              {/* Row Count Options */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-surface border border-default">
                <div>
                  <div className="text-xs font-semibold text-primary">
                    {t("mockData.rowCount")}
                  </div>
                  <div className="text-[11px] text-muted">
                    {t("mockData.rowCountDesc")}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {[10, 25, 50, 100].map((count) => (
                    <button
                      key={count}
                      type="button"
                      onClick={() => setRowCount(count)}
                      className={`px-3 py-1 rounded-md text-xs font-medium font-mono transition-colors ${
                        rowCount === count
                          ? "bg-blue-600 text-white"
                          : "bg-elevated text-secondary hover:text-primary hover:bg-surface-secondary border border-default"
                      }`}
                    >
                      {count}
                    </button>
                  ))}
                </div>
              </div>

              {/* Data Preview */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-muted">
                  <span>
                    {t("mockData.preview")}:
                  </span>
                  <span className="font-mono text-[11px]">
                    {columns.length} {t("mockData.columns")}
                  </span>
                </div>
                <div className="border border-default rounded-lg overflow-x-auto max-h-[260px] bg-base">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="bg-surface text-secondary border-b border-default sticky top-0">
                      <tr>
                        {columns.map((c) => (
                          <th key={c.name} className="px-3 py-2 font-medium whitespace-nowrap">
                            {c.name}
                            <span className="ml-1 text-[10px] text-muted font-normal">
                              ({c.data_type || (c as unknown as { type?: string }).type || "text"})
                            </span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-default/40 text-primary">
                      {mockRows.slice(0, 5).map((row, idx) => (
                        <tr key={idx} className="hover:bg-surface/50">
                          {columns.map((c) => (
                            <td key={c.name} className="px-3 py-1.5 whitespace-nowrap truncate max-w-[200px]">
                              {row[c.name] !== null && row[c.name] !== undefined
                                ? String(row[c.name])
                                : <em className="text-muted">NULL</em>}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-3.5 border-t border-default bg-base flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopySql}
              disabled={isLoadingCols || isInserting || !insertSql}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-secondary hover:text-primary bg-surface border border-default hover:border-strong transition-colors disabled:opacity-50"
            >
              {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
              <span>{copied ? t("common.copied") : t("mockData.copySql")}</span>
            </button>
            <button
              onClick={handleOpenEditor}
              disabled={isLoadingCols || isInserting || !insertSql}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-secondary hover:text-primary bg-surface border border-default hover:border-strong transition-colors disabled:opacity-50"
            >
              <FileCode size={14} className="text-purple-400" />
              <span>{t("mockData.openEditor")}</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={isInserting}
              className="px-3 py-1.5 text-secondary hover:text-primary rounded-lg text-xs font-medium transition-colors"
            >
              {t("common.cancel")}
            </button>
            <button
              onClick={handleInsertDirectly}
              disabled={isLoadingCols || isInserting || !insertSql}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium transition-colors shadow-sm disabled:opacity-50"
            >
              {isInserting ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>{t("mockData.inserting")}</span>
                </>
              ) : (
                <>
                  <Database size={14} />
                  <span>{t("mockData.insertBtn", { count: rowCount })}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
