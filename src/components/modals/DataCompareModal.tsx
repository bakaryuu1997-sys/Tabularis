import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  FileCode,
  GitCompare,
  Loader2,
  X,
} from "lucide-react";
import { Modal } from "../ui/Modal";
import { SqlPreview } from "../ui/SqlPreview";
import { useDatabase } from "../../hooks/useDatabase";
import { useAlert } from "../../hooks/useAlert";
import { copyTextToClipboard } from "../../utils/clipboard";
import { DataCompareError, isIdentical, type DataRow, type TableData } from "../../utils/dataCompare";
import { runDataCompare, type DataCompareRun, type QueryExecutor } from "../../utils/dataCompareRunner";
import { buildSyncScript } from "../../utils/dataSyncSql";
import type { TableColumn } from "../../utils/sqlGenerator";

export interface DataCompareModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Pre-selects the source side, for example from a table's context menu. */
  initial?: { connectionId?: string; table?: string; schema?: string } | null;
  onOpenInEditor?: (sql: string) => void;
}

interface TableInfo {
  name: string;
}

const PREVIEW_LIMIT = 100;

const executeOnConnection: QueryExecutor = async (connectionId, query, limit, page, schema) => {
  const res = await invoke<TableData>("execute_query", {
    connectionId,
    query,
    limit,
    page,
    schema,
  });
  return { columns: res.columns, rows: res.rows };
};

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

const RowList = ({ rows, columns }: { rows: DataRow[]; columns: string[] }) => (
  <div className="overflow-x-auto rounded-lg border border-default">
    <table className="w-full text-[11px] font-mono">
      <thead className="bg-surface-secondary text-muted">
        <tr>
          {columns.map((c) => (
            <th key={c} className="text-left px-2 py-1 font-medium whitespace-nowrap">
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.slice(0, PREVIEW_LIMIT).map((row, i) => (
          <tr key={i} className="border-t border-default/50">
            {columns.map((c) => (
              <td key={c} className="px-2 py-1 whitespace-nowrap text-primary">
                {formatCell(row[c])}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export const DataCompareModal = ({ isOpen, onClose, initial, onOpenInEditor }: DataCompareModalProps) => {
  const { t } = useTranslation();
  const { showAlert } = useAlert();
  const { connections, activeConnectionId } = useDatabase();

  const [sourceConnId, setSourceConnId] = useState(initial?.connectionId ?? activeConnectionId ?? "");
  const [targetConnId, setTargetConnId] = useState("");
  const [sourceSchema, setSourceSchema] = useState(initial?.schema ?? "");
  const [targetSchema, setTargetSchema] = useState("");
  const [sourceTable, setSourceTable] = useState(initial?.table ?? "");
  const [targetTable, setTargetTable] = useState(initial?.table ?? "");
  const [sourceTables, setSourceTables] = useState<string[]>([]);
  const [targetTables, setTargetTables] = useState<string[]>([]);
  const [columns, setColumns] = useState<TableColumn[]>([]);
  const [keyColumns, setKeyColumns] = useState<string[]>([]);

  const [includeDeletes, setIncludeDeletes] = useState(false);
  const [isComparing, setIsComparing] = useState(false);
  const [run, setRun] = useState<DataCompareRun | null>(null);
  const [view, setView] = useState<"diff" | "sql">("diff");
  const [copied, setCopied] = useState(false);

  const driverOf = (id: string) => connections.find((c) => c.id === id)?.params.driver ?? "";

  // Table lists follow the selected connection / schema.
  useEffect(() => {
    if (!isOpen || !sourceConnId) return;
    let cancelled = false;
    invoke<TableInfo[]>("get_tables", { connectionId: sourceConnId, ...(sourceSchema ? { schema: sourceSchema } : {}) })
      .then((tables) => !cancelled && setSourceTables(tables.map((x) => x.name)))
      .catch(() => !cancelled && setSourceTables([]));
    return () => {
      cancelled = true;
    };
  }, [isOpen, sourceConnId, sourceSchema]);

  useEffect(() => {
    if (!isOpen || !targetConnId) return;
    let cancelled = false;
    invoke<TableInfo[]>("get_tables", { connectionId: targetConnId, ...(targetSchema ? { schema: targetSchema } : {}) })
      .then((tables) => !cancelled && setTargetTables(tables.map((x) => x.name)))
      .catch(() => !cancelled && setTargetTables([]));
    return () => {
      cancelled = true;
    };
  }, [isOpen, targetConnId, targetSchema]);

  // The primary key of the source table is the natural default key.
  useEffect(() => {
    if (!isOpen || !sourceConnId || !sourceTable) return;
    let cancelled = false;
    invoke<TableColumn[]>("get_columns", {
      connectionId: sourceConnId,
      tableName: sourceTable,
      ...(sourceSchema ? { schema: sourceSchema } : {}),
    })
      .then((cols) => {
        if (cancelled) return;
        setColumns(cols);
        setKeyColumns(cols.filter((c) => c.is_pk).map((c) => c.name));
      })
      .catch(() => {
        if (!cancelled) {
          setColumns([]);
          setKeyColumns([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, sourceConnId, sourceTable, sourceSchema]);

  const script = useMemo(() => {
    if (!run || !run.canGenerateSql) return null;
    return buildSyncScript(run.result, {
      table: targetTable,
      schema: targetSchema || null,
      driver: driverOf(targetConnId),
      includeDeletes,
    });
    // driverOf only reads `connections`, which is part of the dependency list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, targetTable, targetSchema, targetConnId, includeDeletes, connections]);

  const canCompare =
    !!sourceConnId && !!targetConnId && !!sourceTable && !!targetTable && keyColumns.length > 0 && !isComparing;

  const handleCompare = async () => {
    setIsComparing(true);
    setRun(null);
    setView("diff");
    try {
      const outcome = await runDataCompare(executeOnConnection, {
        source: { connectionId: sourceConnId, schema: sourceSchema || null, table: sourceTable, driver: driverOf(sourceConnId) },
        target: { connectionId: targetConnId, schema: targetSchema || null, table: targetTable, driver: driverOf(targetConnId) },
        keyColumns,
      });
      setRun(outcome);
    } catch (err) {
      const message =
        err instanceof DataCompareError && err.code === "key_column_missing"
          ? t("dataCompare.keyMissing", { columns: err.columns.join(", ") })
          : `${t("dataCompare.error")} ${String(err)}`;
      showAlert(message, { kind: "error" });
    } finally {
      setIsComparing(false);
    }
  };

  const toggleKey = (name: string) =>
    setKeyColumns((prev) => (prev.includes(name) ? prev.filter((c) => c !== name) : [...prev, name]));

  const handleCopy = async () => {
    if (!script?.sql) return;
    await copyTextToClipboard(script.sql);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenEditor = () => {
    if (!script?.sql) return;
    if (onOpenInEditor) onOpenInEditor(script.sql);
    else
      window.dispatchEvent(
        new CustomEvent("tabularis:new-console-with-query", { detail: { query: script.sql, title: "Data Sync" } }),
      );
    onClose();
  };

  const connectionPicker = (
    side: "source" | "target",
    connId: string,
    setConn: (v: string) => void,
    schema: string,
    setSchema: (v: string) => void,
    table: string,
    setTable: (v: string) => void,
    tables: string[],
  ) => (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-primary flex items-center gap-1.5">
        <span className={`w-2 h-2 rounded-full ${side === "source" ? "bg-emerald-400" : "bg-blue-400"}`} />
        <span>{t(side === "source" ? "dataCompare.source" : "dataCompare.target")}</span>
      </label>
      <select
        value={connId}
        onChange={(e) => setConn(e.target.value)}
        className="w-full text-xs px-2.5 py-1.5 rounded-lg bg-base border border-default text-primary focus:border-blue-500 outline-none"
      >
        <option value="">{t("dataCompare.selectConnection")}</option>
        {connections.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name} ({c.params.driver})
          </option>
        ))}
      </select>
      <input
        type="text"
        value={schema}
        onChange={(e) => setSchema(e.target.value)}
        placeholder={t("schemaDiffModal.schemaPlaceholder")}
        className="w-full text-[11px] font-mono px-2 py-1 rounded bg-base border border-default text-primary placeholder:text-muted outline-none"
      />
      <select
        value={table}
        onChange={(e) => setTable(e.target.value)}
        className="w-full text-xs px-2.5 py-1.5 rounded-lg bg-base border border-default text-primary focus:border-blue-500 outline-none"
      >
        <option value="">{t("dataCompare.selectTable")}</option>
        {tables.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
    </div>
  );

  const result = run?.result;
  const rowColumns = result ? [...result.keyColumns, ...result.comparedColumns] : [];

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="bg-elevated border border-strong rounded-xl shadow-2xl w-[900px] max-h-[88vh] overflow-hidden flex flex-col font-sans">
        <div className="flex items-center justify-between p-4 border-b border-default bg-base shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-teal-500/10 text-teal-400 border border-teal-500/20">
              <GitCompare size={18} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-primary">{t("dataCompare.title")}</h2>
              <p className="text-xs text-muted">{t("dataCompare.subtitle")}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-secondary hover:text-primary transition-colors p-1 rounded-md">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 bg-surface border-b border-default grid grid-cols-1 md:grid-cols-2 gap-4 shrink-0">
          {connectionPicker("source", sourceConnId, setSourceConnId, sourceSchema, setSourceSchema, sourceTable, setSourceTable, sourceTables)}
          {connectionPicker("target", targetConnId, setTargetConnId, targetSchema, setTargetSchema, targetTable, setTargetTable, targetTables)}
          {columns.length > 0 && (
            <div className="md:col-span-2 space-y-1.5">
              <div className="text-xs font-semibold text-primary">{t("dataCompare.keyColumns")}</div>
              <div className="flex flex-wrap gap-2">
                {columns.map((c) => (
                  <label
                    key={c.name}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded border text-[11px] font-mono cursor-pointer ${
                      keyColumns.includes(c.name)
                        ? "bg-teal-500/15 border-teal-500/40 text-teal-300"
                        : "bg-base border-default text-secondary"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="hidden"
                      checked={keyColumns.includes(c.name)}
                      onChange={() => toggleKey(c.name)}
                    />
                    {c.is_pk ? "🔑 " : ""}
                    {c.name}
                  </label>
                ))}
              </div>
              {keyColumns.length === 0 && <p className="text-[11px] text-amber-400">{t("dataCompare.noKey")}</p>}
            </div>
          )}
        </div>

        <div className="px-4 py-2.5 bg-base border-b border-default flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            {run && (
              <>
                {(["diff", "sql"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setView(v)}
                    className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${
                      view === v ? "bg-surface-secondary text-primary border border-strong" : "text-secondary hover:text-primary"
                    }`}
                  >
                    {t(v === "diff" ? "dataCompare.viewDiff" : "dataCompare.viewSql")}
                  </button>
                ))}
              </>
            )}
          </div>
          <button
            onClick={handleCompare}
            disabled={!canCompare}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-teal-600 hover:bg-teal-500 text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50 shadow-sm"
          >
            {isComparing ? <Loader2 size={14} className="animate-spin" /> : <GitCompare size={14} />}
            <span>{t(isComparing ? "dataCompare.comparing" : "dataCompare.compare")}</span>
          </button>
        </div>

        <div className="p-4 overflow-y-auto flex-1 space-y-4">
          {!run && !isComparing && (
            <div className="py-14 text-center text-secondary text-xs">
              <GitCompare size={36} className="mx-auto mb-2 text-muted opacity-40" />
              <p>{t("dataCompare.emptyPrompt")}</p>
            </div>
          )}
          {isComparing && (
            <div className="py-14 text-center text-secondary text-xs flex flex-col items-center gap-2">
              <Loader2 size={28} className="animate-spin text-teal-400" />
              <span>{t("dataCompare.reading")}</span>
            </div>
          )}

          {run && result && view === "diff" && (
            <>
              {(run.sourceTruncated || run.targetTruncated) && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                  <span>{t("dataCompare.truncated", { count: Math.max(run.sourceRowCount, run.targetRowCount) })}</span>
                </div>
              )}
              {result.duplicateKeys.length > 0 && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                  <span>{t("dataCompare.duplicateKeys", { count: result.duplicateKeys.length })}</span>
                </div>
              )}
              {(result.sourceOnlyColumns.length > 0 || result.targetOnlyColumns.length > 0) && (
                <p className="text-[11px] text-muted">
                  {t("dataCompare.columnsSkipped", {
                    columns: [...result.sourceOnlyColumns, ...result.targetOnlyColumns].join(", "),
                  })}
                </p>
              )}

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                {[
                  ["identical", result.identicalCount, "text-muted"],
                  ["onlyInSource", result.onlyInSource.length, "text-emerald-400"],
                  ["changed", result.changed.length, "text-amber-400"],
                  ["onlyInTarget", result.onlyInTarget.length, "text-red-400"],
                ].map(([key, count, color]) => (
                  <div key={key as string} className="p-3 rounded-lg bg-surface-secondary/50 border border-default">
                    <div className="text-muted font-medium">{t(`dataCompare.${key}`)}</div>
                    <div className={`text-xl font-bold font-mono ${color}`}>{count as number}</div>
                  </div>
                ))}
              </div>

              {isIdentical(result) && (
                <div className="flex items-center gap-2 text-emerald-400 text-xs">
                  <CheckCircle2 size={16} />
                  {t("dataCompare.noDifferences")}
                </div>
              )}

              {result.onlyInSource.length > 0 && (
                <section className="space-y-1.5">
                  <h3 className="text-xs font-semibold text-emerald-400">{t("dataCompare.onlyInSource")}</h3>
                  <RowList rows={result.onlyInSource} columns={rowColumns} />
                </section>
              )}
              {result.changed.length > 0 && (
                <section className="space-y-1.5">
                  <h3 className="text-xs font-semibold text-amber-400">{t("dataCompare.changed")}</h3>
                  <div className="space-y-1 font-mono text-[11px]">
                    {result.changed.slice(0, PREVIEW_LIMIT).map((row, i) => (
                      <div key={i} className="p-2 rounded border border-default bg-surface-secondary/40">
                        <div className="text-muted">
                          {result.keyColumns.map((k) => `${k}=${formatCell(row.key[k])}`).join(", ")}
                        </div>
                        {row.changes.map((c) => (
                          <div key={c.column}>
                            <span className="text-secondary">{c.column}: </span>
                            <span className="text-red-300 line-through">{formatCell(c.target)}</span>
                            <span className="text-muted"> → </span>
                            <span className="text-emerald-300">{formatCell(c.source)}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </section>
              )}
              {result.onlyInTarget.length > 0 && (
                <section className="space-y-1.5">
                  <h3 className="text-xs font-semibold text-red-400">{t("dataCompare.onlyInTarget")}</h3>
                  <RowList rows={result.onlyInTarget} columns={rowColumns} />
                </section>
              )}
            </>
          )}

          {run && view === "sql" && (
            <>
              {!script ? (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                  <span>{t("dataCompare.sqlUnavailable")}</span>
                </div>
              ) : (
                <>
                  <label className="flex items-center gap-2 text-xs text-secondary cursor-pointer">
                    <input type="checkbox" checked={includeDeletes} onChange={(e) => setIncludeDeletes(e.target.checked)} />
                    {t("dataCompare.includeDeletes")}
                  </label>
                  {script.skipped.length > 0 && (
                    <p className="text-[11px] text-amber-400">{t("dataCompare.skippedRows", { count: script.skipped.length })}</p>
                  )}
                  <p className="text-[11px] text-muted">
                    {t("dataCompare.scriptSummary", script.counts)}
                  </p>
                  <SqlPreview sql={script.sql || `-- ${t("dataCompare.noDifferences")}`} height={300} />
                  <p className="text-[11px] text-muted">{t("dataCompare.reviewNote")}</p>
                </>
              )}
            </>
          )}
        </div>

        {run && view === "sql" && script?.sql && (
          <div className="p-3 border-t border-default bg-base flex justify-end gap-2 shrink-0">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-secondary hover:bg-surface border border-default text-xs text-primary"
            >
              {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
              {copied ? t("common.copied") : t("dataCompare.copySql")}
            </button>
            <button
              onClick={handleOpenEditor}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-xs font-medium"
            >
              <FileCode size={13} />
              {t("dataCompare.openInEditor")}
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
};
