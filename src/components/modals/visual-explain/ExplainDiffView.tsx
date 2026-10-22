import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  TrendingDown,
  Layers,
  Copy,
  Check,
  AlertTriangle,
  Database,
} from "lucide-react";
import type { ExplainPlan } from "../../../types/explain";
import { analyzePlanForOptimization } from "../../../utils/aiExplainDiff";
import { copyTextToClipboard } from "../../../utils/clipboard";
import { useAlert } from "../../../hooks/useAlert";

export interface ExplainDiffViewProps {
  plan: ExplainPlan;
}

export const ExplainDiffView: React.FC<ExplainDiffViewProps> = ({ plan }) => {
  const { t } = useTranslation();
  const { showAlert } = useAlert();
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const analysis = useMemo(() => {
    return analyzePlanForOptimization(plan);
  }, [plan]);

  const handleCopy = async (sql: string, idx: number) => {
    try {
      await copyTextToClipboard(sql);
      setCopiedIndex(idx);
      showAlert(t("common.copied", "Đã chép SQL!"), { kind: "info" });
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch {
      showAlert(t("common.error", "Lỗi sao chép!"), { kind: "error" });
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-base/20">
      {/* Top Banner */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-lg bg-surface border border-default">
          <span className="text-xs text-muted block mb-1">
            {t("explainDiff.currentCost", "Chi phí Kế hoạch Hiện tại")}
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-bold font-mono text-amber-400">
              {analysis.originalCost.toFixed(1)}
            </span>
            <span className="text-xs text-amber-400/80 font-medium">(Seq Scan)</span>
          </div>
        </div>

        <div className="p-4 rounded-lg bg-surface border border-default">
          <span className="text-xs text-muted block mb-1">
            {t("explainDiff.projectedCost", "Chi phí Kế hoạch Đề xuất")}
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-bold font-mono text-emerald-400">
              {analysis.projectedCost.toFixed(1)}
            </span>
            <span className="text-xs text-emerald-400/80 font-medium">(Index Scan)</span>
          </div>
        </div>

        <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
          <span className="text-xs text-emerald-400 block mb-1">
            {t("explainDiff.improvement", "Mức độ Tối ưu Ước tính")}
          </span>
          <div className="flex items-baseline gap-2">
            <TrendingDown className="w-5 h-5 text-emerald-400" />
            <span className="text-xl font-bold font-mono text-emerald-300">
              -{analysis.costReductionPercent}%
            </span>
            <span className="text-xs text-emerald-300 font-semibold">
              (~{analysis.estimatedSpeedupFactor}x nhanh hơn)
            </span>
          </div>
        </div>
      </div>

      {/* Suggested Indexes Box */}
      {analysis.suggestedIndexes.length > 0 ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-primary">
            <Layers className="w-4 h-4 text-amber-400" />
            {t("explainDiff.recommendedIndexes", "Đề xuất Chỉ Mục (Index Suggestions)")}
          </div>

          {analysis.suggestedIndexes.map((idx, i) => (
            <div
              key={i}
              className="p-4 rounded-lg bg-surface border border-default space-y-3"
            >
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-muted leading-relaxed">{idx.reason}</p>
              </div>

              <div className="flex items-center justify-between p-3 rounded bg-base border border-default font-mono text-xs text-primary">
                <span className="overflow-x-auto select-all">{idx.ddl}</span>
                <button
                  onClick={() => handleCopy(idx.ddl, i)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded bg-surface-secondary hover:bg-surface border border-default text-xs text-primary transition-colors ml-4 shrink-0"
                >
                  {copiedIndex === i ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      {t("common.copied", "Đã chép")}
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      {t("common.copy", "Chép SQL")}
                    </>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="p-4 rounded-lg bg-surface border border-default text-center text-xs text-muted">
          {analysis.summary}
        </div>
      )}

      {/* Side-by-Side Comparison */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-primary">
          <Database className="w-4 h-4 text-blue-400" />
          {t("explainDiff.planComparison", "So sánh Cây Kế hoạch Thực thi")}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 rounded-lg bg-surface border border-amber-500/20 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-default">
              <span className="text-xs font-semibold text-amber-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                {t("explainDiff.currentPlan", "Kế hoạch Hiện tại (Trước)")}
              </span>
              <span className="text-xs font-mono text-muted">
                Cost: {plan.root.total_cost?.toFixed(1) ?? "—"}
              </span>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted">Node Type:</span>
                <span className="font-mono font-semibold text-amber-300">
                  {plan.root.node_type}
                </span>
              </div>
              {plan.root.relation && (
                <div className="flex justify-between">
                  <span className="text-muted">Bảng (Relation):</span>
                  <span className="font-mono text-primary">{plan.root.relation}</span>
                </div>
              )}
              {plan.root.filter && (
                <div className="flex flex-col gap-1">
                  <span className="text-muted">Bộ lọc (Filter):</span>
                  <span className="font-mono p-1.5 rounded bg-base text-muted text-[11px] break-all">
                    {plan.root.filter}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="p-4 rounded-lg bg-surface border border-emerald-500/20 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-default">
              <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                {t("explainDiff.projectedPlan", "Kế hoạch Tối ưu (Sau)")}
              </span>
              <span className="text-xs font-mono text-emerald-400 font-semibold">
                Cost: {analysis.simulatedAfterPlan.root.total_cost?.toFixed(1) ?? "—"}
              </span>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted">Node Type:</span>
                <span className="font-mono font-semibold text-emerald-300">
                  {analysis.simulatedAfterPlan.root.node_type}
                </span>
              </div>
              {analysis.simulatedAfterPlan.root.relation && (
                <div className="flex justify-between">
                  <span className="text-muted">Bảng (Relation):</span>
                  <span className="font-mono text-primary">
                    {analysis.simulatedAfterPlan.root.relation}
                  </span>
                </div>
              )}
              {analysis.simulatedAfterPlan.root.index_condition && (
                <div className="flex flex-col gap-1">
                  <span className="text-muted">Điều kiện chỉ mục (Index Cond):</span>
                  <span className="font-mono p-1.5 rounded bg-base text-emerald-300 text-[11px] break-all">
                    {analysis.simulatedAfterPlan.root.index_condition}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
