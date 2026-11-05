import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  X,
  BarChart2,
  Copy,
  Check,
  Hash,
  Type,
  Calendar,
} from "lucide-react";
import { Modal } from "../ui/Modal";
import type { ColumnProfileResult } from "../../utils/columnProfiler";

interface ColumnProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: ColumnProfileResult | null;
}

export const ColumnProfileModal = ({
  isOpen,
  onClose,
  profile,
}: ColumnProfileModalProps) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  if (!profile) return null;

  const handleCopyReport = async () => {
    let report = `### ${t("columnProfile.report.title", { column: profile.columnName, type: profile.inferredType })}\n\n`;
    report += `- **${t("columnProfile.report.totalRows")}:** ${profile.totalRows}\n`;
    report += `- **${t("columnProfile.report.nullRows")}:** ${profile.nullCount} (${profile.nullPercentage}%)\n`;
    report += `- **${t("columnProfile.report.distinct")}:** ${profile.distinctCount} (${profile.distinctPercentage}%)\n`;

    if (profile.numericStats) {
      report += `- **Min:** ${profile.numericStats.min} | **Max:** ${profile.numericStats.max} | **Avg:** ${profile.numericStats.avg}\n`;
    }
    if (profile.dateStats) {
      report += `- **${t("columnProfile.report.earliest")}:** ${profile.dateStats.earliest} | **${t("columnProfile.report.latest")}:** ${profile.dateStats.latest}\n`;
    }

    if (profile.topFrequencies.length > 0) {
      report += `\n**${t("columnProfile.report.topValues")}:**\n`;
      for (const item of profile.topFrequencies) {
        report += `- \`${item.value}\`: ${t("columnProfile.report.occurrences", { count: item.count })} (${item.percentage}%)\n`;
      }
    }

    await navigator.clipboard.writeText(report);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const renderTypeIcon = () => {
    switch (profile.inferredType) {
      case "number":
        return <Hash size={16} className="text-blue-400" />;
      case "date":
        return <Calendar size={16} className="text-emerald-400" />;
      default:
        return <Type size={16} className="text-purple-400" />;
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="bg-elevated border border-strong rounded-xl shadow-2xl w-[580px] max-h-[85vh] overflow-hidden flex flex-col font-sans">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-default bg-base shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <BarChart2 size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-primary">
                  {profile.columnName}
                </h2>
                <span className="flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded bg-surface border border-default text-secondary">
                  {renderTypeIcon()}
                  <span>{profile.inferredType}</span>
                </span>
              </div>
              <p className="text-xs text-muted">
                {t("columnProfile.subtitle")}
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

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-5">
          {/* 4 Metric Cards */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-lg bg-surface border border-default">
              <div className="text-xs text-muted font-medium">
                {t("columnProfile.totalRows")}
              </div>
              <div className="text-xl font-semibold text-primary mt-1 font-mono">
                {profile.totalRows.toLocaleString()}
              </div>
            </div>

            <div className="p-3 rounded-lg bg-surface border border-default">
              <div className="text-xs text-muted font-medium flex items-center justify-between">
                <span>{t("columnProfile.nullCount")}</span>
                <span className="text-[11px] text-amber-400 font-mono">
                  {profile.nullPercentage}%
                </span>
              </div>
              <div className="text-xl font-semibold text-primary mt-1 font-mono flex items-baseline gap-2">
                <span>{profile.nullCount.toLocaleString()}</span>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-surface border border-default">
              <div className="text-xs text-muted font-medium flex items-center justify-between">
                <span>{t("columnProfile.distinctCount")}</span>
                <span className="text-[11px] text-indigo-400 font-mono">
                  {profile.distinctPercentage}%
                </span>
              </div>
              <div className="text-xl font-semibold text-primary mt-1 font-mono">
                {profile.distinctCount.toLocaleString()}
              </div>
            </div>

            {profile.numericStats ? (
              <div className="p-3 rounded-lg bg-surface border border-default">
                <div className="text-xs text-muted font-medium">
                  {t("columnProfile.average")}
                </div>
                <div className="text-xl font-semibold text-primary mt-1 font-mono">
                  {profile.numericStats.avg.toLocaleString()}
                </div>
              </div>
            ) : profile.stringStats ? (
              <div className="p-3 rounded-lg bg-surface border border-default">
                <div className="text-xs text-muted font-medium">
                  {t("columnProfile.lengthRange")}
                </div>
                <div className="text-base font-semibold text-primary mt-1 font-mono">
                  {profile.stringStats.minLength} - {profile.stringStats.maxLength} {t("columnProfile.characters")}
                </div>
              </div>
            ) : (
              <div className="p-3 rounded-lg bg-surface border border-default">
                <div className="text-xs text-muted font-medium">
                  {t("columnProfile.validRows")}
                </div>
                <div className="text-xl font-semibold text-primary mt-1 font-mono">
                  {(profile.totalRows - profile.nullCount).toLocaleString()}
                </div>
              </div>
            )}
          </div>

          {/* Min / Max Range for Numbers & Dates */}
          {profile.numericStats && (
            <div className="p-3 rounded-lg bg-surface border border-default flex items-center justify-between text-xs">
              <div>
                <span className="text-muted">Min: </span>
                <span className="font-mono font-medium text-primary">
                  {profile.numericStats.min.toLocaleString()}
                </span>
              </div>
              <div>
                <span className="text-muted">Max: </span>
                <span className="font-mono font-medium text-primary">
                  {profile.numericStats.max.toLocaleString()}
                </span>
              </div>
              <div>
                <span className="text-muted">{t("columnProfile.sum")}</span>
                <span className="font-mono font-medium text-primary">
                  {profile.numericStats.sum.toLocaleString()}
                </span>
              </div>
            </div>
          )}

          {profile.dateStats && (
            <div className="p-3 rounded-lg bg-surface border border-default flex items-center justify-between text-xs">
              <div>
                <span className="text-muted">{t("columnProfile.earliest")}</span>
                <span className="font-mono font-medium text-primary">
                  {profile.dateStats.earliest}
                </span>
              </div>
              <div>
                <span className="text-muted">{t("columnProfile.latest")}</span>
                <span className="font-mono font-medium text-primary">
                  {profile.dateStats.latest}
                </span>
              </div>
            </div>
          )}

          {/* Top Frequencies Histogram */}
          {profile.topFrequencies.length > 0 && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-xs font-semibold text-secondary">
                <span>{t("columnProfile.topValues")}</span>
                <span className="text-[11px] text-muted font-normal">{t("columnProfile.frequencyPercent")}</span>
              </div>
              <div className="space-y-2">
                {profile.topFrequencies.map((item, idx) => (
                  <div key={idx} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono text-primary truncate max-w-[340px]" title={item.value}>
                        {item.value || <em className="text-muted">{t("columnProfile.emptyString")}</em>}
                      </span>
                      <span className="text-muted font-mono text-[11px]">
                        {item.count.toLocaleString()} ({item.percentage}%)
                      </span>
                    </div>
                    {/* Progress bar */}
                    <div className="h-2 w-full bg-base rounded-full overflow-hidden border border-default/40">
                      <div
                        className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                        style={{ width: `${Math.max(item.percentage, 2)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3.5 border-t border-default bg-base flex items-center justify-between shrink-0">
          <button
            onClick={handleCopyReport}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-secondary hover:text-primary bg-surface border border-default hover:border-strong transition-colors"
          >
            {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
            <span>{copied ? t("common.copied") : t("columnProfile.copyReport")}</span>
          </button>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium transition-colors"
          >
            {t("common.close")}
          </button>
        </div>
      </div>
    </Modal>
  );
};
