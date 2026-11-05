import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  X,
  Plus,
  Trash2,
  Highlighter,
  Sliders,
  Check,
} from "lucide-react";
import {
  type HighlightRule,
  type HighlightOperator,
  type HighlightColorScheme,
  type HighlightTarget,
  HIGHLIGHT_COLOR_SCHEMES,
  getHighlightStyle,
} from "../../utils/highlightRules";

interface HighlightRulesModalProps {
  isOpen: boolean;
  onClose: () => void;
  columns: string[];
  rules: HighlightRule[];
  onRulesChange: (rules: HighlightRule[]) => void;
  tableName?: string | null;
}

const OPERATOR_LABEL_KEYS: Record<HighlightOperator, string> = {
  "=": "highlight.operators.eq",
  "!=": "highlight.operators.neq",
  ">": "highlight.operators.gt",
  ">=": "highlight.operators.gte",
  "<": "highlight.operators.lt",
  "<=": "highlight.operators.lte",
  contains: "highlight.operators.contains",
  not_contains: "highlight.operators.notContains",
  starts_with: "highlight.operators.startsWith",
  ends_with: "highlight.operators.endsWith",
  is_null: "highlight.operators.isNull",
  is_not_null: "highlight.operators.isNotNull",
};

const COLOR_KEYS: HighlightColorScheme[] = [
  "red",
  "green",
  "amber",
  "blue",
  "purple",
  "rose",
  "emerald",
  "indigo",
  "cyan",
  "gray",
];

export const HighlightRulesModal: React.FC<HighlightRulesModalProps> = ({
  isOpen,
  onClose,
  columns,
  rules,
  onRulesChange,
  tableName,
}) => {
  const { t } = useTranslation();
  const [localRules, setLocalRules] = useState<HighlightRule[]>(rules);

  // Sync when modal opens
  React.useEffect(() => {
    setLocalRules(rules);
  }, [rules, isOpen]);

  if (!isOpen) return null;

  const handleAddRule = () => {
    const newRule: HighlightRule = {
      id: "rule_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7),
      column: columns[0] || "",
      operator: "=",
      value: "",
      colorScheme: "amber",
      target: "row",
      enabled: true,
    };
    const updated = [...localRules, newRule];
    setLocalRules(updated);
    onRulesChange(updated);
  };

  const handleUpdateRule = (id: string, patch: Partial<HighlightRule>) => {
    const updated = localRules.map((r) => (r.id === id ? { ...r, ...patch } : r));
    setLocalRules(updated);
    onRulesChange(updated);
  };

  const handleDeleteRule = (id: string) => {
    const updated = localRules.filter((r) => r.id !== id);
    setLocalRules(updated);
    onRulesChange(updated);
  };

  const handleClearAll = () => {
    setLocalRules([]);
    onRulesChange([]);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="bg-elevated border border-default rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-default bg-surface-secondary/40">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Highlighter size={18} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-primary flex items-center gap-2">
                <span>{t("highlight.title")}</span>
                {tableName && (
                  <span className="text-xs px-2 py-0.5 rounded bg-surface-tertiary text-secondary font-mono">
                    {tableName}
                  </span>
                )}
              </h2>
              <p className="text-xs text-muted mt-0.5">
                {t("highlight.subtitle")}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted hover:text-primary hover:bg-surface-secondary transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {localRules.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center border-2 border-dashed border-default rounded-xl bg-surface-secondary/20">
              <Sliders size={32} className="text-muted/60 mb-3" />
              <p className="text-sm font-medium text-secondary">
                {t("highlight.emptyTitle")}
              </p>
              <p className="text-xs text-muted max-w-md mt-1">
                {t("highlight.emptyDesc")}
              </p>
              <button
                type="button"
                onClick={handleAddRule}
                className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors shadow-sm"
              >
                <Plus size={14} />
                <span>{t("highlight.addFirstRule")}</span>
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {localRules.map((rule, idx) => {
                const styleDef = getHighlightStyle(rule.colorScheme);
                const isNullOp = rule.operator === "is_null" || rule.operator === "is_not_null";

                return (
                  <div
                    key={rule.id}
                    className={`p-3.5 rounded-lg border transition-all ${
                      rule.enabled
                        ? "bg-surface-secondary/40 border-default"
                        : "bg-surface-secondary/10 border-default/40 opacity-60"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3 mb-2.5">
                      <div className="flex items-center gap-2">
                        {/* Toggle enabled checkbox */}
                        <label className="flex items-center gap-1.5 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={rule.enabled}
                            onChange={(e) => handleUpdateRule(rule.id, { enabled: e.target.checked })}
                            className="rounded border-default text-blue-600 focus:ring-0 focus:ring-offset-0 bg-base w-3.5 h-3.5"
                          />
                          <span className="text-xs font-semibold text-secondary">
                            Rule #{idx + 1}
                          </span>
                        </label>

                        {/* Preview Chip */}
                        <span
                          className={`text-[11px] px-2 py-0.5 rounded border font-medium ${styleDef.badgeClass}`}
                        >
                          {rule.target === "row" ? t("highlight.targetRow") : t("highlight.targetCell")}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleDeleteRule(rule.id)}
                          className="p-1 rounded text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          title={t("common.delete")}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    {/* Controls row */}
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center">
                      {/* Column */}
                      <div className="sm:col-span-3">
                        <label className="block text-[10px] text-muted mb-1 uppercase tracking-wider">
                          {t("highlight.column")}
                        </label>
                        <select
                          value={rule.column}
                          onChange={(e) => handleUpdateRule(rule.id, { column: e.target.value })}
                          className="w-full text-xs bg-base border border-default rounded px-2 py-1.5 text-primary outline-none focus:border-blue-500 font-mono"
                        >
                          {columns.map((col) => (
                            <option key={col} value={col}>
                              {col}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Operator */}
                      <div className="sm:col-span-3">
                        <label className="block text-[10px] text-muted mb-1 uppercase tracking-wider">
                          {t("highlight.operator")}
                        </label>
                        <select
                          value={rule.operator}
                          onChange={(e) =>
                            handleUpdateRule(rule.id, {
                              operator: e.target.value as HighlightOperator,
                            })
                          }
                          className="w-full text-xs bg-base border border-default rounded px-2 py-1.5 text-primary outline-none focus:border-blue-500"
                        >
                          {Object.entries(OPERATOR_LABEL_KEYS).map(([op, labelKey]) => (
                            <option key={op} value={op}>
                              {t(labelKey)}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Value (if not null op) */}
                      <div className={isNullOp ? "hidden" : "sm:col-span-3"}>
                        <label className="block text-[10px] text-muted mb-1 uppercase tracking-wider">
                          {t("highlight.value")}
                        </label>
                        <input
                          type="text"
                          value={rule.value}
                          onChange={(e) => handleUpdateRule(rule.id, { value: e.target.value })}
                          placeholder={t("highlight.valuePlaceholder")}
                          className="w-full text-xs bg-base border border-default rounded px-2 py-1.5 text-primary outline-none focus:border-blue-500 font-mono placeholder:text-muted/50"
                        />
                      </div>

                      {/* Target: Row vs Cell */}
                      <div className={isNullOp ? "sm:col-span-3" : "sm:col-span-3"}>
                        <label className="block text-[10px] text-muted mb-1 uppercase tracking-wider">
                          {t("highlight.target")}
                        </label>
                        <select
                          value={rule.target}
                          onChange={(e) =>
                            handleUpdateRule(rule.id, {
                              target: e.target.value as HighlightTarget,
                            })
                          }
                          className="w-full text-xs bg-base border border-default rounded px-2 py-1.5 text-primary outline-none focus:border-blue-500"
                        >
                          <option value="row">{t("highlight.targetRow")}</option>
                          <option value="cell">{t("highlight.targetCell")}</option>
                        </select>
                      </div>
                    </div>

                    {/* Color selection row */}
                    <div className="mt-3 flex items-center gap-2 pt-2 border-t border-default/50">
                      <span className="text-[11px] text-muted shrink-0">
                        {t("highlight.color")}
                      </span>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {COLOR_KEYS.map((cKey) => {
                          const cDef = HIGHLIGHT_COLOR_SCHEMES[cKey];
                          const isSelected = rule.colorScheme === cKey;
                          return (
                            <button
                              key={cKey}
                              type="button"
                              onClick={() => handleUpdateRule(rule.id, { colorScheme: cKey })}
                              title={t(`highlight.colors.${cKey}`)}
                              className={`w-5 h-5 rounded-full border transition-all flex items-center justify-center ${
                                isSelected
                                  ? "scale-110 ring-2 ring-blue-500 ring-offset-1 ring-offset-base"
                                  : "opacity-75 hover:opacity-100 hover:scale-105"
                              }`}
                              style={{ backgroundColor: cDef.hex, borderColor: "rgba(255,255,255,0.2)" }}
                            >
                              {isSelected && <Check size={10} className="text-white drop-shadow" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-default bg-surface-secondary/40">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleAddRule}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-surface-secondary hover:bg-surface-tertiary border border-default text-primary transition-colors"
            >
              <Plus size={13} />
              <span>{t("highlight.addRule")}</span>
            </button>
            {localRules.length > 0 && (
              <button
                type="button"
                onClick={handleClearAll}
                className="text-xs text-muted hover:text-red-400 px-2 py-1.5 transition-colors"
              >
                {t("highlight.clearAll")}
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors shadow-sm"
          >
            {t("common.done")}
          </button>
        </div>
      </div>
    </div>
  );
};
