import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, ShieldAlert, X, Play } from "lucide-react";
import clsx from "clsx";

export interface ProductionSafetyModalProps {
  isOpen: boolean;
  query: string;
  dangerReasons: string[];
  isProduction: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function ProductionSafetyModal({
  isOpen,
  query,
  dangerReasons,
  isProduction,
  onConfirm,
  onClose,
}: ProductionSafetyModalProps) {
  const { t } = useTranslation();
  const [secondsLeft, setSecondsLeft] = useState(5);
  const [wasOpen, setWasOpen] = useState(isOpen);

  // Restart the countdown whenever the modal transitions from closed to open.
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) setSecondsLeft(5);
  }

  useEffect(() => {
    if (!isOpen) return;

    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-elevated border-2 border-red-500/60 rounded-xl max-w-xl w-full shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 bg-red-500/10 border-b border-red-500/20 flex items-center gap-3">
          <div className="p-2 bg-red-500/20 text-red-400 rounded-lg shrink-0">
            {isProduction ? <ShieldAlert size={22} /> : <AlertTriangle size={22} />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-red-400">
                {isProduction
                  ? t("safety.productionWarningTitle")
                  : t("safety.dangerousQueryTitle")}
              </h3>
              {isProduction && (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-red-600 text-white">
                  PRODUCTION
                </span>
              )}
            </div>
            <p className="text-xs text-muted mt-0.5">
              {t("safety.safetyGuardSubtitle")}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-muted hover:text-primary hover:bg-surface-secondary transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 flex flex-col gap-4 max-h-[60vh] overflow-y-auto">
          {/* Danger reasons list */}
          <div className="flex flex-col gap-2">
            {dangerReasons.map((reason, idx) => (
              <div
                key={idx}
                className="flex items-start gap-2.5 p-3 rounded-lg bg-red-950/30 border border-red-500/30 text-xs text-red-200"
              >
                <AlertTriangle size={15} className="shrink-0 text-red-400 mt-0.5" />
                <span className="font-medium leading-relaxed">{reason}</span>
              </div>
            ))}
          </div>

          {/* SQL Preview */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-secondary uppercase tracking-wider">
              {t("safety.queryPreview")}
            </span>
            <pre className="p-3 bg-surface-secondary/70 border border-strong rounded-lg text-xs font-mono text-primary max-h-40 overflow-y-auto whitespace-pre-wrap break-all select-text">
              {query}
            </pre>
          </div>
        </div>

        {/* Footer actions */}
        <div className="px-5 py-3.5 bg-surface-secondary/50 border-t border-default flex items-center justify-between">
          <div className="text-xs text-muted">
            {secondsLeft > 0 ? (
              <span className="text-amber-400 font-mono">
                {t("safety.countdownText", {
                  seconds: secondsLeft,
                })}
              </span>
            ) : (
              <span className="text-emerald-400 font-medium">
                {t("safety.unlockedText")}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm text-secondary hover:text-primary bg-surface-secondary hover:bg-surface-tertiary border border-default transition-colors"
            >
              {t("common.cancel")}
            </button>
            <button
              disabled={secondsLeft > 0}
              onClick={() => {
                onClose();
                onConfirm();
              }}
              className={clsx(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all",
                secondsLeft > 0
                  ? "bg-red-500/30 text-red-300/50 cursor-not-allowed border border-red-500/20"
                  : "bg-red-600 text-white hover:bg-red-500 shadow-lg shadow-red-600/30 active:scale-95 cursor-pointer",
              )}
            >
              <Play size={14} />
              {secondsLeft > 0
                ? `${t("safety.waiting")} (${secondsLeft}s)`
                : t("safety.confirmExecution")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
