import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  X,
  ExternalLink,
  Copy,
  Check,
  Hash,
  Type,
  Calendar,
} from "lucide-react";
import type { ColumnProfileResult } from "../../utils/columnProfiler";
import { getColumnTypeVisual } from "../../utils/columnTypeBadge";

export interface ColumnQuickStatsPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  anchorRect: { top: number; left: number; bottom: number; right: number } | null;
  profile: ColumnProfileResult | null;
  declaredType?: string;
  onOpenFullModal?: () => void;
}

export const ColumnQuickStatsPopover: React.FC<ColumnQuickStatsPopoverProps> = ({
  isOpen,
  onClose,
  anchorRect,
  profile,
  declaredType,
  onOpenFullModal,
}) => {
  const { t } = useTranslation();
  const popoverRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  // Close on Escape or click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !profile || !anchorRect) {
    return null;
  }

  const typeVisual = getColumnTypeVisual(declaredType || profile.inferredType);

  // Calculate coordinates to keep popover within viewport
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const popoverWidth = 320;
  const popoverHeight = 380;

  let left = anchorRect.left;
  if (left + popoverWidth > viewportWidth - 16) {
    left = Math.max(16, viewportWidth - popoverWidth - 16);
  }

  let top = anchorRect.bottom + 6;
  if (top + popoverHeight > viewportHeight - 16) {
    top = Math.max(16, anchorRect.top - popoverHeight - 6);
  }

  const handleCopySummary = async () => {
    let summary = `${profile.columnName} (${typeVisual.shortName})\n`;
    summary += `Rows: ${profile.totalRows} | Distinct: ${profile.distinctCount} (${profile.distinctPercentage}%) | NULL: ${profile.nullCount} (${profile.nullPercentage}%)\n`;
    if (profile.numericStats) {
      summary += `Min: ${profile.numericStats.min} | Max: ${profile.numericStats.max} | Avg: ${profile.numericStats.avg}\n`;
    }
    if (profile.dateStats) {
      summary += `Earliest: ${profile.dateStats.earliest} | Latest: ${profile.dateStats.latest}\n`;
    }
    await navigator.clipboard.writeText(summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const validPercentage = Math.max(0, 100 - profile.nullPercentage);

  return (
    <div
      ref={popoverRef}
      style={{
        position: "fixed",
        top: `${top}px`,
        left: `${left}px`,
        zIndex: 9999,
      }}
      className="w-[320px] bg-elevated border border-strong rounded-xl shadow-2xl overflow-hidden flex flex-col font-sans animate-in fade-in zoom-in-95 duration-100"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-base border-b border-default select-none">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono border ${typeVisual.badgeClass}`}
          >
            {typeVisual.icon}
            <span>{typeVisual.shortName}</span>
          </span>
          <span className="font-semibold text-xs text-primary truncate" title={profile.columnName}>
            {profile.columnName}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleCopySummary}
            title={t("dataGrid.copySummary", { defaultValue: "Sao chép tóm tắt thống kê" })}
            className="p-1 rounded text-muted hover:text-primary hover:bg-surface-secondary transition-colors"
          >
            {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-muted hover:text-primary hover:bg-surface-secondary transition-colors"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-3.5 space-y-3 max-h-[360px] overflow-y-auto text-xs">
        {/* Data Quality & Distribution Mini-Bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-[11px] text-muted">
            <span>
              {t("columnProfile.validValues", { defaultValue: "Hợp lệ" })}:{" "}
              <strong className="text-emerald-400">{validPercentage}%</strong>
            </span>
            <span>
              NULL:{" "}
              <strong className={profile.nullCount > 0 ? "text-amber-400" : "text-secondary"}>
                {profile.nullPercentage}%
              </strong>
            </span>
          </div>
          <div className="h-1.5 w-full bg-surface-secondary rounded-full overflow-hidden flex">
            <div
              style={{ width: `${validPercentage}%` }}
              className="bg-emerald-500 h-full transition-all"
              title={`Hợp lệ: ${profile.totalRows - profile.nullCount} dòng`}
            />
            {profile.nullPercentage > 0 && (
              <div
                style={{ width: `${profile.nullPercentage}%` }}
                className="bg-amber-500/70 h-full transition-all"
                title={`NULL: ${profile.nullCount} dòng`}
              />
            )}
          </div>
        </div>

        {/* Overview 3-Box Grid */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-surface/50 border border-default/70 p-2 rounded-lg text-center">
            <div className="text-[10px] text-muted uppercase font-medium">
              {t("columnProfile.rows", { defaultValue: "Tổng dòng" })}
            </div>
            <div className="text-xs font-semibold text-primary mt-0.5">
              {profile.totalRows.toLocaleString()}
            </div>
          </div>
          <div className="bg-surface/50 border border-default/70 p-2 rounded-lg text-center">
            <div className="text-[10px] text-muted uppercase font-medium">
              {t("columnProfile.distinct", { defaultValue: "Duy nhất" })}
            </div>
            <div className="text-xs font-semibold text-blue-400 mt-0.5">
              {profile.distinctCount.toLocaleString()}
            </div>
          </div>
          <div className="bg-surface/50 border border-default/70 p-2 rounded-lg text-center">
            <div className="text-[10px] text-muted uppercase font-medium">
              NULL
            </div>
            <div
              className={`text-xs font-semibold mt-0.5 ${
                profile.nullCount > 0 ? "text-amber-400" : "text-secondary"
              }`}
            >
              {profile.nullCount.toLocaleString()}
            </div>
          </div>
        </div>

        {/* Numeric Statistics */}
        {profile.numericStats && (
          <div className="bg-surface/30 border border-default/60 rounded-lg p-2.5 space-y-1.5">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-blue-300">
              <Hash size={12} />
              <span>{t("columnProfile.numericStats", { defaultValue: "Thống kê số lượng" })}</span>
            </div>
            <div className="grid grid-cols-3 gap-1.5 text-center text-[11px]">
              <div className="bg-base/60 py-1 px-1.5 rounded border border-default/40">
                <span className="text-muted block text-[9px]">MIN</span>
                <span className="font-mono text-primary font-medium">
                  {typeof profile.numericStats.min === "number"
                    ? profile.numericStats.min.toLocaleString()
                    : profile.numericStats.min}
                </span>
              </div>
              <div className="bg-base/60 py-1 px-1.5 rounded border border-default/40">
                <span className="text-muted block text-[9px]">AVG</span>
                <span className="font-mono text-primary font-medium">
                  {typeof profile.numericStats.avg === "number"
                    ? Number(profile.numericStats.avg.toFixed(2)).toLocaleString()
                    : profile.numericStats.avg}
                </span>
              </div>
              <div className="bg-base/60 py-1 px-1.5 rounded border border-default/40">
                <span className="text-muted block text-[9px]">MAX</span>
                <span className="font-mono text-primary font-medium">
                  {typeof profile.numericStats.max === "number"
                    ? profile.numericStats.max.toLocaleString()
                    : profile.numericStats.max}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Date Statistics */}
        {profile.dateStats && (
          <div className="bg-surface/30 border border-default/60 rounded-lg p-2.5 space-y-1 text-[11px]">
            <div className="flex items-center gap-1.5 font-medium text-purple-300 mb-1">
              <Calendar size={12} />
              <span>{t("columnProfile.dateRange", { defaultValue: "Khoảng thời gian" })}</span>
            </div>
            <div className="flex justify-between items-center text-muted">
              <span>{t("columnProfile.earliest", { defaultValue: "Sớm nhất" })}:</span>
              <span className="font-mono text-primary">{profile.dateStats.earliest}</span>
            </div>
            <div className="flex justify-between items-center text-muted">
              <span>{t("columnProfile.latest", { defaultValue: "Muộn nhất" })}:</span>
              <span className="font-mono text-primary">{profile.dateStats.latest}</span>
            </div>
          </div>
        )}

        {/* String Statistics */}
        {profile.stringStats && !profile.numericStats && !profile.dateStats && (
          <div className="bg-surface/30 border border-default/60 rounded-lg p-2.5 space-y-1 text-[11px]">
            <div className="flex items-center gap-1.5 font-medium text-emerald-300 mb-1">
              <Type size={12} />
              <span>{t("columnProfile.stringLength", { defaultValue: "Độ dài chuỗi" })}</span>
            </div>
            <div className="flex justify-between items-center text-muted">
              <span>{t("columnProfile.lengthRange", { defaultValue: "Độ dài Min - Max" })}:</span>
              <span className="font-mono text-primary">
                {profile.stringStats.minLength} - {profile.stringStats.maxLength} ký tự
              </span>
            </div>
            {profile.stringStats.emptyCount > 0 && (
              <div className="flex justify-between items-center text-muted">
                <span>{t("columnProfile.emptyStrings", { defaultValue: "Chuỗi rỗng ('')" })}:</span>
                <span className="font-mono text-amber-400">
                  {profile.stringStats.emptyCount}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Top Frequencies (Distribution Mini-Bars) */}
        {profile.topFrequencies && profile.topFrequencies.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[10px] font-medium text-muted uppercase tracking-wider">
              {t("columnProfile.topValues", { defaultValue: "Giá trị phổ biến nhất" })}
            </div>
            <div className="space-y-1">
              {profile.topFrequencies.slice(0, 3).map((item, idx) => (
                <div key={idx} className="space-y-0.5">
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="font-mono truncate max-w-[190px] text-secondary" title={item.value}>
                      {item.value === "" ? "'' (Empty)" : item.value}
                    </span>
                    <span className="text-muted text-[10px]">
                      {item.count} ({item.percentage}%)
                    </span>
                  </div>
                  <div className="h-1 w-full bg-surface-secondary rounded-full overflow-hidden">
                    <div
                      style={{ width: `${item.percentage}%` }}
                      className="bg-blue-500/80 h-full rounded-full"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      {onOpenFullModal && (
        <div className="p-2 bg-base border-t border-default flex justify-end">
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenFullModal();
            }}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 transition-colors font-medium"
          >
            <span>{t("columnProfile.viewFullReport", { defaultValue: "Xem phân tích đầy đủ" })}</span>
            <ExternalLink size={12} />
          </button>
        </div>
      )}
    </div>
  );
};
