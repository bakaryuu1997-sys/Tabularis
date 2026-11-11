import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  X,
  GitCompare,
  Loader2,
  Copy,
  Check,
  FileCode,
  PlusCircle,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { Modal } from "../ui/Modal";
import { useDatabase } from "../../hooks/useDatabase";
import { useAlert } from "../../hooks/useAlert";
import {
  compareSchemas,
  type SchemaDiffResult,
} from "../../utils/schemaDiff";
import { loadSchemaColumns } from "../../utils/schemaFetch";
import { SqlPreview } from "../ui/SqlPreview";

interface SchemaDiffModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenInEditor?: (sql: string) => void;
}

export const SchemaDiffModal = ({
  isOpen,
  onClose,
  onOpenInEditor,
}: SchemaDiffModalProps) => {
  const { t } = useTranslation();
  const { showAlert } = useAlert();
  const { connections, activeConnectionId } = useDatabase();

  const [sourceConnId, setSourceConnId] = useState<string>(activeConnectionId || "");
  const [targetConnId, setTargetConnId] = useState<string>("");
  const [sourceSchema, setSourceSchema] = useState<string>("");
  const [targetSchema, setTargetSchema] = useState<string>("");

  const [isComparing, setIsComparing] = useState(false);
  const [diffResult, setDiffResult] = useState<SchemaDiffResult | null>(null);
  const [activeTab, setActiveTab] = useState<"diff" | "sql">("diff");
  const [copied, setCopied] = useState(false);

  const handleCompare = async () => {
    if (!sourceConnId || !targetConnId) {
      showAlert(t("schemaDiff.selectBoth"), {
        kind: "warning",
      });
      return;
    }

    setIsComparing(true);
    setDiffResult(null);

    try {
      // Tables and columns of both databases: 2 batch calls instead of 2 + 2N (see loadSchemaColumns).
      const [source, target] = await Promise.all([
        loadSchemaColumns(sourceConnId, sourceSchema),
        loadSchemaColumns(targetConnId, targetSchema),
      ]);
      const { tables: srcTables, columns: srcColsMap } = source;
      const { tables: tgtTables, columns: tgtColsMap } = target;

      const sourceConn = connections.find(c => c.id === sourceConnId);
      const dialect = sourceConn?.params.driver || "postgres";

      const result = compareSchemas(
        srcTables,
        srcColsMap,
        tgtTables,
        tgtColsMap,
        dialect,
      );

      setDiffResult(result);
    } catch (err) {
      console.error("Failed to compare schemas:", err);
      showAlert(
        `${t("schemaDiff.error")}: ${String(err)}`,
        { kind: "error" },
      );
    } finally {
      setIsComparing(false);
    }
  };

  const handleCopySql = async () => {
    if (!diffResult?.migrationSql) return;
    await navigator.clipboard.writeText(diffResult.migrationSql);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenEditor = () => {
    if (!diffResult?.migrationSql) return;
    if (onOpenInEditor) {
      onOpenInEditor(diffResult.migrationSql);
    } else {
      window.dispatchEvent(
        new CustomEvent("tabularis:new-console-with-query", {
          detail: { query: diffResult.migrationSql, title: "Schema Sync" },
        }),
      );
    }
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="bg-elevated border border-strong rounded-xl shadow-2xl w-[820px] max-h-[85vh] overflow-hidden flex flex-col font-sans">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-default bg-base shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-teal-500/10 text-teal-400 border border-teal-500/20">
              <GitCompare size={18} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-primary">
                {t("schemaDiff.title")}
              </h2>
              <p className="text-xs text-muted">
                {t("schemaDiff.subtitle")}
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

        {/* Connection Picker */}
        <div className="p-4 bg-surface border-b border-default grid grid-cols-1 md:grid-cols-2 gap-4 shrink-0">
          {/* Source */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-primary flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>{t("schemaDiff.source")}</span>
            </label>
            <select
              value={sourceConnId}
              onChange={(e) => setSourceConnId(e.target.value)}
              className="w-full text-xs px-2.5 py-1.5 rounded-lg bg-base border border-default text-primary focus:border-blue-500 outline-none"
            >
              <option value="">{t("schemaDiff.selectConnection")}</option>
              {connections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.params.driver})
                </option>
              ))}
            </select>
            <input
              type="text"
              value={sourceSchema}
              onChange={(e) => setSourceSchema(e.target.value)}
              placeholder={t("schemaDiffModal.schemaPlaceholder")}
              className="w-full text-[11px] font-mono px-2 py-1 rounded bg-base border border-default text-primary placeholder:text-muted outline-none"
            />
          </div>

          {/* Target */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-primary flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-400" />
              <span>{t("schemaDiff.target")}</span>
            </label>
            <select
              value={targetConnId}
              onChange={(e) => setTargetConnId(e.target.value)}
              className="w-full text-xs px-2.5 py-1.5 rounded-lg bg-base border border-default text-primary focus:border-blue-500 outline-none"
            >
              <option value="">{t("schemaDiff.selectConnection")}</option>
              {connections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.params.driver})
                </option>
              ))}
            </select>
            <input
              type="text"
              value={targetSchema}
              onChange={(e) => setTargetSchema(e.target.value)}
              placeholder={t("schemaDiffModal.schemaPlaceholder")}
              className="w-full text-[11px] font-mono px-2 py-1 rounded bg-base border border-default text-primary placeholder:text-muted outline-none"
            />
          </div>
        </div>

        {/* Action button */}
        <div className="px-4 py-2.5 bg-base border-b border-default flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            {diffResult && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab("diff")}
                  className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${
                    activeTab === "diff"
                      ? "bg-surface-secondary text-primary border border-strong"
                      : "text-secondary hover:text-primary"
                  }`}
                >
                  {t("schemaDiff.visualDiff")}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("sql")}
                  className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${
                    activeTab === "sql"
                      ? "bg-surface-secondary text-primary border border-strong"
                      : "text-secondary hover:text-primary"
                  }`}
                >
                  {t("schemaDiff.migrationSql", "Script Migration SQL")}
                </button>
              </div>
            )}
          </div>

          <button
            onClick={handleCompare}
            disabled={isComparing || !sourceConnId || !targetConnId}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-teal-600 hover:bg-teal-500 text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50 shadow-sm"
          >
            {isComparing ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                <span>{t("schemaDiff.comparing")}</span>
              </>
            ) : (
              <>
                <GitCompare size={14} />
                <span>{t("schemaDiff.compareBtn")}</span>
              </>
            )}
          </button>
        </div>

        {/* Results Body */}
        <div className="p-4 overflow-y-auto flex-1 space-y-4">
          {!diffResult && !isComparing && (
            <div className="py-16 text-center text-secondary text-xs">
              <GitCompare size={36} className="mx-auto mb-2 text-muted opacity-40" />
              <p>{t("schemaDiff.emptyPrompt")}</p>
            </div>
          )}

          {isComparing && (
            <div className="py-16 text-center text-secondary text-xs flex flex-col items-center justify-center gap-2">
              <Loader2 size={28} className="animate-spin text-teal-400" />
              <span>{t("schemaDiff.readingSchemas")}</span>
            </div>
          )}

          {diffResult && (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-4 gap-2.5">
                <div className="p-2.5 rounded-lg bg-surface border border-default text-xs">
                  <div className="text-muted font-medium">{t("schemaDiffModal.identicalTables")}</div>
                  <div className="text-base font-semibold text-emerald-400 mt-0.5 font-mono">
                    {diffResult.summary.identicalCount}
                  </div>
                </div>
                <div className="p-2.5 rounded-lg bg-surface border border-default text-xs">
                  <div className="text-muted font-medium">{t("schemaDiffModal.sourceOnly")}</div>
                  <div className="text-base font-semibold text-blue-400 mt-0.5 font-mono">
                    {diffResult.summary.sourceOnlyCount}
                  </div>
                </div>
                <div className="p-2.5 rounded-lg bg-surface border border-default text-xs">
                  <div className="text-muted font-medium">{t("schemaDiffModal.withDifferences")}</div>
                  <div className="text-base font-semibold text-amber-400 mt-0.5 font-mono">
                    {diffResult.summary.differentCount}
                  </div>
                </div>
                <div className="p-2.5 rounded-lg bg-surface border border-default text-xs">
                  <div className="text-muted font-medium">{t("schemaDiffModal.targetOnly")}</div>
                  <div className="text-base font-semibold text-muted mt-0.5 font-mono">
                    {diffResult.summary.targetOnlyCount}
                  </div>
                </div>
              </div>

              {activeTab === "diff" ? (
                <div className="space-y-2">
                  {diffResult.tables.map((tDiff) => {
                    const isIdentical = tDiff.status === "identical";
                    const isSourceOnly = tDiff.status === "source_only";
                    const isDiff = tDiff.status === "different";

                    return (
                      <div
                        key={tDiff.tableName}
                        className={`p-3 rounded-lg border text-xs font-sans ${
                          isIdentical
                            ? "bg-surface/50 border-default/50 opacity-75"
                            : isSourceOnly
                            ? "bg-blue-500/5 border-blue-500/30"
                            : isDiff
                            ? "bg-amber-500/5 border-amber-500/30"
                            : "bg-surface border-default"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {isIdentical && <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />}
                            {isSourceOnly && <PlusCircle size={14} className="text-blue-400 shrink-0" />}
                            {isDiff && <AlertTriangle size={14} className="text-amber-400 shrink-0" />}
                            <span className="font-mono font-semibold text-primary">
                              {tDiff.tableName}
                            </span>
                          </div>
                          <div>
                            {isSourceOnly && (
                              <span className="px-2 py-0.5 rounded text-[10px] bg-blue-500/20 text-blue-300 font-medium">
                                {t("schemaDiffModal.missingInTarget")}
                              </span>
                            )}
                            {isDiff && (
                              <span className="px-2 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-300 font-medium">
                                {t("schemaDiffModal.columnsDiffer", { count: tDiff.columnDiffs.length })}
                              </span>
                            )}
                            {isIdentical && (
                              <span className="text-[10px] text-muted">
                                {t("schemaDiffModal.identical")}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Column diffs */}
                        {tDiff.columnDiffs.length > 0 && (
                          <div className="mt-2.5 pt-2 border-t border-default/40 space-y-1.5 pl-6 font-mono text-[11px]">
                            {tDiff.columnDiffs.map((c, i) => (
                              <div key={i} className="flex items-center gap-2">
                                {c.kind === "missing_in_target" && (
                                  <span className="text-emerald-400">{t("schemaDiffModal.missingColumn")} <strong>{c.name}</strong> ({c.sourceType})</span>
                                )}
                                {c.kind === "extra_in_target" && (
                                  <span className="text-muted">{t("schemaDiffModal.extraColumn")} <strong>{c.name}</strong> ({c.targetType})</span>
                                )}
                                {c.kind === "type_mismatch" && (
                                  <span className="text-amber-400">{t("schemaDiffModal.typeMismatch")} <strong>{c.name}</strong> ({t("schemaDiffModal.sourceVsTarget", { source: c.sourceType, target: c.targetType })})</span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="border border-default rounded-lg overflow-hidden">
                  <SqlPreview sql={diffResult.migrationSql} />
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-3.5 border-t border-default bg-base flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            {diffResult && (
              <>
                <button
                  onClick={handleCopySql}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-secondary hover:text-primary bg-surface border border-default hover:border-strong transition-colors"
                >
                  {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                  <span>{copied ? t("common.copied") : t("schemaDiff.copySql")}</span>
                </button>
                <button
                  onClick={handleOpenEditor}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-secondary hover:text-primary bg-surface border border-default hover:border-strong transition-colors"
                >
                  <FileCode size={14} className="text-purple-400" />
                  <span>{t("schemaDiff.openEditor")}</span>
                </button>
              </>
            )}
          </div>

          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-surface hover:bg-surface-secondary text-primary border border-default rounded-lg text-xs font-medium transition-colors"
          >
            {t("common.close")}
          </button>
        </div>
      </div>
    </Modal>
  );
};
