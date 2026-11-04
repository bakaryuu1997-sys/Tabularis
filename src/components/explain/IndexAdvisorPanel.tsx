import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  Check,
  Copy,
  Database,
  Layers,
  Loader2,
  SquareTerminal,
  TrendingDown,
} from "lucide-react";
import type { ExplainNode, ExplainPlan } from "../../types/explain";
import { useIndexAdvisor } from "../../hooks/useIndexAdvisor";
import { useAlert } from "../../hooks/useAlert";
import { copyTextToClipboard } from "../../utils/clipboard";

export interface IndexAdvisorPanelProps {
  plan: ExplainPlan;
  /** Needed to verify suggestions with the database planner. Without it only suggestions are shown. */
  connectionId?: string | null;
  schema?: string | null;
  /** Opens generated SQL in an editor tab for review. Index DDL is never executed from here. */
  onInsertSql?: (sql: string) => void;
}

function formatCost(value: number | null | undefined): string {
  return value == null ? "—" : value.toFixed(1);
}

const PlanSummary: React.FC<{ title: string; plan: ExplainPlan; tone: "before" | "after" }> = ({
  title,
  plan,
  tone,
}) => {
  const { t } = useTranslation();
  const root: ExplainNode = plan.root;
  const border = tone === "before" ? "border-amber-500/20" : "border-emerald-500/20";
  const accent = tone === "before" ? "text-amber-400" : "text-emerald-400";
  return (
    <div className={`p-4 rounded-lg bg-surface-secondary/40 border ${border} space-y-3`}>
      <div className="flex items-center justify-between pb-2 border-b border-default">
        <span className={`text-xs font-semibold ${accent}`}>{title}</span>
        <span className="text-xs font-mono text-muted">
          {t("explainDiff.cost")}: {formatCost(root.total_cost)}
        </span>
      </div>
      <div className="space-y-2 text-xs">
        <div className="flex justify-between">
          <span className="text-muted">{t("explainDiff.nodeType")}</span>
          <span className={`font-mono font-semibold ${accent}`}>{root.node_type}</span>
        </div>
        {root.relation && (
          <div className="flex justify-between">
            <span className="text-muted">{t("explainDiff.relation")}</span>
            <span className="font-mono text-primary">{root.relation}</span>
          </div>
        )}
        {(root.index_condition || root.filter) && (
          <div className="flex flex-col gap-1">
            <span className="text-muted">
              {root.index_condition ? t("explainDiff.indexCondition") : t("explainDiff.filter")}
            </span>
            <span className="font-mono p-1.5 rounded bg-base text-muted text-[11px] break-all">
              {root.index_condition ?? root.filter}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export const IndexAdvisorPanel: React.FC<IndexAdvisorPanelProps> = ({
  plan,
  connectionId,
  schema,
  onInsertSql,
}) => {
  const { t } = useTranslation();
  const { showAlert } = useAlert();
  const { candidates, whatIf, ddl } = useIndexAdvisor(plan, connectionId, schema);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const ready = whatIf.status === "ready" ? whatIf : null;
  const ddlRows = ddl.status === "done" ? ddl.value : null;

  const handleCopy = async (sql: string, idx: number) => {
    try {
      await copyTextToClipboard(sql);
      setCopiedIndex(idx);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch {
      showAlert(t("common.error"), { kind: "error" });
    }
  };

  const statusMessage = (() => {
    switch (whatIf.status) {
      case "no_connection":
        return t("explainDiff.statusNoConnection");
      case "unsupported":
        return t("explainDiff.statusUnsupported");
      case "extension_missing":
        return t("explainDiff.statusExtensionMissing", { extension: whatIf.extension });
      case "error":
        return `${t("explainDiff.statusError")} ${whatIf.message}`;
      default:
        return null;
    }
  })();

  return (
    <div className="space-y-6">
      {/* Planner-verified metrics (only when the database confirmed them) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-lg bg-surface-secondary/50 border border-default">
          <span className="text-xs text-muted block mb-1">{t("explainDiff.currentCost")}</span>
          <span className="text-xl font-bold font-mono text-amber-400">
            {formatCost(plan.root.total_cost)}
          </span>
        </div>
        <div className="p-4 rounded-lg bg-surface-secondary/50 border border-default">
          <span className="text-xs text-muted block mb-1">{t("explainDiff.projectedCost")}</span>
          <span className="text-xl font-bold font-mono text-emerald-400">
            {ready ? formatCost(ready.comparison.afterCost) : "—"}
          </span>
        </div>
        <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
          <span className="text-xs text-emerald-400 block mb-1">{t("explainDiff.improvement")}</span>
          <div className="flex items-baseline gap-2">
            <TrendingDown className="w-5 h-5 text-emerald-400" />
            <span className="text-xl font-bold font-mono text-emerald-300">
              {ready?.comparison.costReductionPercent != null
                ? `-${ready.comparison.costReductionPercent}%`
                : "—"}
            </span>
            {ready?.comparison.costRatio != null && (
              <span className="text-xs text-emerald-300 font-semibold">
                {t("explainDiff.costRatio", { ratio: ready.comparison.costRatio })}
              </span>
            )}
          </div>
        </div>
      </div>

      {whatIf.status === "loading" && (
        <div className="flex items-center gap-2 text-xs text-muted">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          {t("explainDiff.statusLoading")}
        </div>
      )}

      {statusMessage && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{statusMessage}</span>
        </div>
      )}

      {/* Suggestions */}
      {candidates.length > 0 ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-primary">
            <Layers className="w-4 h-4 text-amber-400" />
            {t("explainDiff.recommendedIndexes")}
          </div>

          {candidates.map((candidate, i) => {
            const sql = ddlRows?.[i]?.map((s) => `${s};`).join("\n") ?? null;
            const verified = ready
              ? ready.comparison.resolvedTables.includes(candidate.tableName)
              : null;
            return (
              <div
                key={`${candidate.tableName}-${candidate.columns.join(",")}`}
                className="p-4 rounded-lg bg-surface-secondary border border-default space-y-3"
              >
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-muted leading-relaxed">
                    {t("explainDiff.reasonFullScan", {
                      table: candidate.tableName,
                      columns: candidate.columns.join(", "),
                      cost: candidate.scanCost.toFixed(1),
                    })}
                  </p>
                </div>

                {verified !== null && (
                  <p
                    className={`text-xs font-medium ${verified ? "text-emerald-400" : "text-amber-400"}`}
                  >
                    {verified ? t("explainDiff.verifiedUsed") : t("explainDiff.verifiedIgnored")}
                  </p>
                )}

                <div className="flex items-center justify-between gap-3 p-3 rounded bg-base border border-default font-mono text-xs text-primary">
                  <span className="overflow-x-auto select-all whitespace-pre">
                    {sql ?? (ddl.status === "error" ? ddl.message : "…")}
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      disabled={!sql}
                      onClick={() => sql && handleCopy(sql, i)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded bg-surface-secondary hover:bg-surface border border-default text-xs text-primary transition-colors disabled:opacity-50"
                    >
                      {copiedIndex === i ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          {t("common.copied")}
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          {t("explainDiff.copySql")}
                        </>
                      )}
                    </button>
                    {onInsertSql && (
                      <button
                        disabled={!sql}
                        onClick={() => sql && onInsertSql(sql)}
                        className="flex items-center gap-1.5 px-3 py-1 rounded bg-primary text-primary-foreground font-medium text-xs hover:opacity-90 disabled:opacity-50 transition-all shadow-sm"
                      >
                        <SquareTerminal className="w-3 h-3" />
                        {t("explainDiff.openInEditor")}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          <p className="text-[11px] text-muted">{t("explainDiff.reviewNote")}</p>
        </div>
      ) : (
        <div className="p-4 rounded-lg bg-surface-secondary border border-default text-center text-xs text-muted">
          {t("explainDiff.noCandidates")}
        </div>
      )}

      {/* Real before / after plans */}
      {ready && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-primary">
            <Database className="w-4 h-4 text-blue-400" />
            {t("explainDiff.planComparison")}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <PlanSummary title={t("explainDiff.currentPlan")} plan={plan} tone="before" />
            <PlanSummary title={t("explainDiff.projectedPlan")} plan={ready.afterPlan} tone="after" />
          </div>
        </div>
      )}
    </div>
  );
};
