import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  X,
  Zap,
  Check,
  Copy,
  TrendingDown,
  AlertTriangle,
  Play,
  Database,
  Layers,
} from "lucide-react";
import type { ExplainPlan } from "../../types/explain";
import { analyzePlanForOptimization } from "../../utils/aiExplainDiff";
import { useAlert } from "../../hooks/useAlert";
import { copyTextToClipboard } from "../../utils/clipboard";
import { invoke } from "@tauri-apps/api/core";

export interface VisualExplainDiffModalProps {
  isOpen: boolean;
  onClose: () => void;
  plan: ExplainPlan | null;
  connectionId?: string | null;
  onIndexCreated?: () => void;
}

export const VisualExplainDiffModal: React.FC<VisualExplainDiffModalProps> = ({
  isOpen,
  onClose,
  plan,
  connectionId,
  onIndexCreated,
}) => {
  const { t } = useTranslation();
  const { showAlert } = useAlert();
  const [isExecuting, setIsExecuting] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const analysis = useMemo(() => {
    if (!plan) return null;
    return analyzePlanForOptimization(plan);
  }, [plan]);

  if (!isOpen || !plan || !analysis) return null;

  const handleCopy = async (sql: string, idx: number) => {
    try {
      await copyTextToClipboard(sql);
      setCopiedIndex(idx);
      showAlert(t("common.copied", "Đã sao chép!"), { kind: "info" });
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch {
      showAlert(t("common.error", "Lỗi sao chép!"), { kind: "error" });
    }
  };

  const handleExecuteIndex = async (ddl: string) => {
    if (!connectionId) {
      showAlert(t("explainDiff.noConnection", "Không tìm thấy kết nối CSDL hiện tại."), { kind: "warning" });
      return;
    }

    setIsExecuting(true);
    try {
      await invoke("execute_query", {
        connectionId,
        query: ddl,
        schema: null,
      });
      showAlert(t("explainDiff.indexSuccess", "Đã tạo chỉ mục thành công!"), { kind: "info" });
      if (onIndexCreated) onIndexCreated();
    } catch (err) {
      showAlert(`${t("explainDiff.indexFailed", "Lỗi tạo chỉ mục:")} ${String(err)}`, { kind: "error" });
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="relative flex flex-col w-full max-w-4xl max-h-[88vh] bg-surface border border-default rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-default bg-base/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-primary">
                {t("explainDiff.title", "AI Explain Plan Diff & Tối Ưu Chỉ Mục")}
              </h2>
              <p className="text-xs text-muted">
                {t("explainDiff.subtitle", "So sánh kế hoạch thực thi trước và sau khi đánh index tối ưu")}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted hover:text-primary hover:bg-surface-secondary transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Key Metrics Comparison Banner */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-lg bg-surface-secondary/50 border border-default">
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

            <div className="p-4 rounded-lg bg-surface-secondary/50 border border-default">
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

          {/* AI Recommendations & Index DDL Box */}
          {analysis.suggestedIndexes.length > 0 ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                <Layers className="w-4 h-4 text-amber-400" />
                {t("explainDiff.recommendedIndexes", "Đề xuất Chỉ Mục (Index Suggestions)")}
              </div>

              {analysis.suggestedIndexes.map((idx, i) => (
                <div
                  key={i}
                  className="p-4 rounded-lg bg-surface-secondary border border-default space-y-3"
                >
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-muted leading-relaxed">
                      {idx.reason}
                    </p>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded bg-base border border-default font-mono text-xs text-primary">
                    <span className="overflow-x-auto select-all">{idx.ddl}</span>
                    <div className="flex items-center gap-2 shrink-0 ml-4">
                      <button
                        onClick={() => handleCopy(idx.ddl, i)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded bg-surface-secondary hover:bg-surface border border-default text-xs text-primary transition-colors"
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

                      <button
                        onClick={() => handleExecuteIndex(idx.ddl)}
                        disabled={isExecuting}
                        className="flex items-center gap-1.5 px-3 py-1 rounded bg-primary text-primary-foreground font-medium text-xs hover:opacity-90 disabled:opacity-50 transition-all shadow-sm"
                      >
                        <Play className="w-3 h-3 fill-current" />
                        {isExecuting ? t("common.executing", "Đang tạo...") : t("explainDiff.applyIndex", "Tạo Index Ngay")}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4 rounded-lg bg-surface-secondary border border-default text-center text-xs text-muted">
              {analysis.summary}
            </div>
          )}

          {/* Side-by-Side Node Diff Tree */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-primary">
              <Database className="w-4 h-4 text-blue-400" />
              {t("explainDiff.planComparison", "So sánh Cây Kế hoạch Thực thi")}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Left Column: Current */}
              <div className="p-4 rounded-lg bg-surface-secondary/40 border border-amber-500/20 space-y-3">
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
                  {plan.execution_time_ms != null && (
                    <div className="flex justify-between">
                      <span className="text-muted">Thời gian thực thi:</span>
                      <span className="font-mono text-amber-400">
                        {plan.execution_time_ms.toFixed(1)} ms
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Simulated */}
              <div className="p-4 rounded-lg bg-surface-secondary/40 border border-emerald-500/20 space-y-3">
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
                  {analysis.simulatedAfterPlan.execution_time_ms != null && (
                    <div className="flex justify-between">
                      <span className="text-muted">Thời gian ước tính:</span>
                      <span className="font-mono text-emerald-400 font-bold">
                        {analysis.simulatedAfterPlan.execution_time_ms.toFixed(1)} ms
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-default bg-base/50">
          <span className="text-xs text-muted">
            {t("explainDiff.note", "Mô phỏng dựa trên thống kê chi phí tối ưu hóa truy vấn của database engine")}
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-surface-secondary hover:bg-surface border border-default text-xs font-medium text-primary transition-colors"
          >
            {t("common.close", "Đóng")}
          </button>
        </div>
      </div>
    </div>
  );
};
