import { useState } from "react";
import { useTranslation } from "react-i18next";
import { X, Loader2, FileSpreadsheet, CheckCircle, AlertTriangle } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { Modal } from "../ui/Modal";
import { useDatabase } from "../../hooks/useDatabase";
import { bytesToBase64 } from "../../utils/base64";
import { buildXlsxWorkbook } from "../../utils/xlsxWriter";
import {
  TABLE_SPEC_LANGUAGES,
  buildTableSpecSheets,
  tableSpecFileName,
  type TableSpecLanguage,
} from "../../utils/tableSpec";
import { loadTableSpecData } from "../../utils/tableSpecData";

interface TableSpecModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Table the dialog was opened from; offers "this table only" next to "all tables". */
  tableName?: string | null;
}

type Scope = "table" | "all";
type Phase = "idle" | "working" | "done" | "error";

/**
 * Exports the table-definition document (テーブル定義書) of the active database or schema to an Excel file.
 * Logical names and notes are read from the database comments of tables and columns.
 */
export const TableSpecModal = (props: TableSpecModalProps) =>
  // Mounted only while open, so every opening starts from a clean dialog.
  props.isOpen ? <TableSpecDialog {...props} /> : null;

const TableSpecDialog = ({ isOpen, onClose, tableName }: TableSpecModalProps) => {
  const { t } = useTranslation();
  const { activeConnectionId, activeConnectionName, activeDatabaseName, activeSchema } = useDatabase();

  const [scope, setScope] = useState<Scope>(tableName ? "table" : "all");
  const [language, setLanguage] = useState<TableSpecLanguage>("ja");
  const [includeIndexes, setIncludeIndexes] = useState(true);
  const [includeForeignKeys, setIncludeForeignKeys] = useState(true);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [savedPath, setSavedPath] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notes, setNotes] = useState<string[]>([]);

  const working = phase === "working";

  const handleExport = async () => {
    if (!activeConnectionId) return;
    setPhase("working");
    setSavedPath(null);
    setErrorMessage(null);
    setNotes([]);
    try {
      const data = await loadTableSpecData({
        connectionId: activeConnectionId,
        schema: activeSchema,
        tableNames: scope === "table" && tableName ? [tableName] : undefined,
        includeIndexes,
        onProgress: (done, total) => setProgress({ done, total }),
      });

      const sheets = buildTableSpecSheets({
        tables: data.tables,
        comments: data.comments,
        language,
        options: { includeIndexes, includeForeignKeys },
        meta: {
          connectionName: activeConnectionName ?? "",
          databaseName: activeDatabaseName ?? "",
          schema: activeSchema,
          generatedAt: new Date(),
        },
      });

      const path = await invoke<string | null>("save_binary_file_with_dialog", {
        defaultFileName: tableSpecFileName(activeDatabaseName || activeConnectionName || "database"),
        filterName: "Excel Spreadsheet (*.xlsx)",
        extensions: ["xlsx"],
        base64Data: bytesToBase64(buildXlsxWorkbook(sheets)),
      });

      const messages: string[] = [];
      if (data.noComments) messages.push(t("tableSpec.noComments"));
      if (data.indexWarnings.length > 0) {
        messages.push(t("tableSpec.indexWarning", { tables: data.indexWarnings.join(", ") }));
      }
      setNotes(messages);
      if (path) {
        setSavedPath(path);
        setPhase("done");
      } else {
        // The save dialog was cancelled: nothing was written.
        setPhase("idle");
      }
    } catch (error) {
      setErrorMessage(typeof error === "string" ? error : error instanceof Error ? error.message : String(error));
      setPhase("error");
    }
  };

  const checkbox = (id: string, checked: boolean, onChange: (value: boolean) => void, label: string) => (
    <label htmlFor={id} className="flex items-center gap-2.5 cursor-pointer select-none w-fit">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={working}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-blue-500 w-3.5 h-3.5 rounded"
      />
      <span className="text-sm text-secondary">{label}</span>
    </label>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="bg-elevated border border-strong rounded-xl shadow-2xl w-[520px] max-w-[90vw] max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-default bg-base">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-900/30 rounded-lg">
              <FileSpreadsheet size={20} className="text-emerald-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-primary">{t("tableSpec.title")}</h2>
              <p className="text-xs text-secondary">{t("tableSpec.subtitle")}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-secondary hover:text-primary transition-colors" aria-label={t("common.close")}>
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto">
          {tableName && (
            <fieldset className="space-y-2" disabled={working}>
              <legend className="text-[10px] uppercase font-semibold tracking-wider text-muted mb-1">
                {t("tableSpec.scope")}
              </legend>
              {(["table", "all"] as const).map((value) => (
                <label key={value} className="flex items-center gap-2.5 cursor-pointer select-none w-fit">
                  <input
                    type="radio"
                    name="table-spec-scope"
                    checked={scope === value}
                    onChange={() => setScope(value)}
                    className="accent-blue-500"
                  />
                  <span className="text-sm text-secondary">
                    {value === "table" ? t("tableSpec.scopeTable", { table: tableName }) : t("tableSpec.scopeAll")}
                  </span>
                </label>
              ))}
            </fieldset>
          )}

          <div className="space-y-1">
            <label htmlFor="table-spec-language" className="text-[10px] uppercase font-semibold tracking-wider text-muted">
              {t("tableSpec.language")}
            </label>
            <select
              id="table-spec-language"
              value={language}
              disabled={working}
              onChange={(e) => setLanguage(e.target.value as TableSpecLanguage)}
              className="w-full bg-base border border-default rounded-lg px-3 py-2 text-sm text-primary focus:outline-none focus:border-blue-500"
            >
              {TABLE_SPEC_LANGUAGES.map((code) => (
                <option key={code} value={code}>
                  {t(`tableSpec.language_${code}`)}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            {checkbox("table-spec-indexes", includeIndexes, setIncludeIndexes, t("tableSpec.includeIndexes"))}
            {checkbox("table-spec-fks", includeForeignKeys, setIncludeForeignKeys, t("tableSpec.includeForeignKeys"))}
          </div>

          <p className="text-xs text-muted leading-relaxed">{t("tableSpec.hint")}</p>

          {working && (
            <div className="flex items-center gap-2 text-sm text-secondary" role="status">
              <Loader2 size={16} className="animate-spin text-blue-400" />
              {progress.total > 0
                ? t("tableSpec.progress", { done: progress.done, total: progress.total })
                : t("tableSpec.loading")}
            </div>
          )}

          {phase === "done" && savedPath && (
            <div className="flex items-start gap-2 text-sm text-green-400" role="status">
              <CheckCircle size={16} className="shrink-0 mt-0.5" />
              <span className="break-all">{t("tableSpec.saved", { path: savedPath })}</span>
            </div>
          )}

          {notes.map((note) => (
            <div key={note} className="flex items-start gap-2 text-xs text-amber-400" role="status">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span className="break-words">{note}</span>
            </div>
          ))}

          {phase === "error" && errorMessage && (
            <div className="flex items-start gap-2 text-sm text-red-400" role="alert">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <span className="break-words">{errorMessage}</span>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-default bg-base">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-secondary hover:text-primary hover:bg-surface-secondary transition-colors"
          >
            {t("common.close")}
          </button>
          <button
            onClick={handleExport}
            disabled={working || !activeConnectionId}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {working ? <Loader2 size={16} className="animate-spin" /> : <FileSpreadsheet size={16} />}
            {t("tableSpec.export")}
          </button>
        </div>
      </div>
    </Modal>
  );
};
