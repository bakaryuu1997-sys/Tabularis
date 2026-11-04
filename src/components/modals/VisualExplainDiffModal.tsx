import React from "react";
import { useTranslation } from "react-i18next";
import { X, Zap } from "lucide-react";
import type { ExplainPlan } from "../../types/explain";
import { IndexAdvisorPanel } from "../explain/IndexAdvisorPanel";

export interface VisualExplainDiffModalProps {
  isOpen: boolean;
  onClose: () => void;
  plan: ExplainPlan | null;
  connectionId?: string | null;
  schema?: string | null;
  /** Opens the suggested DDL in an editor tab. Nothing is executed from this dialog. */
  onInsertSql?: (sql: string) => void;
}

export const VisualExplainDiffModal: React.FC<VisualExplainDiffModalProps> = ({
  isOpen,
  onClose,
  plan,
  connectionId,
  schema,
  onInsertSql,
}) => {
  const { t } = useTranslation();

  if (!isOpen || !plan) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="relative flex flex-col w-full max-w-4xl max-h-[88vh] bg-surface border border-default rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-default bg-base/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-primary">{t("explainDiff.title")}</h2>
              <p className="text-xs text-muted">{t("explainDiff.subtitle")}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted hover:text-primary hover:bg-surface-secondary transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <IndexAdvisorPanel
            plan={plan}
            connectionId={connectionId}
            schema={schema}
            onInsertSql={(sql) => {
              onInsertSql?.(sql);
              onClose();
            }}
          />
        </div>

        <div className="flex items-center justify-between px-6 py-3 border-t border-default bg-base/50">
          <span className="text-xs text-muted">{t("explainDiff.note")}</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-surface-secondary hover:bg-surface border border-default text-xs font-medium text-primary transition-colors"
          >
            {t("common.close")}
          </button>
        </div>
      </div>
    </div>
  );
};
