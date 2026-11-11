import { useTranslation } from "react-i18next";
import { MonitorPlay, X } from "lucide-react";
import { usePresentationMode } from "../../hooks/usePresentationMode";

/** A small pill shown while presenting, so it is obvious that data is masked and the app is read-only. */
export const PresentationBanner = () => {
  const { t } = useTranslation();
  const { isPresentationMode, exitPresentationMode } = usePresentationMode();
  if (!isPresentationMode) return null;

  return (
    <div
      role="status"
      className="fixed top-2 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-2 rounded-full border border-amber-500/40 bg-amber-500/15 px-3 py-1 text-xs font-medium text-amber-300 shadow-lg backdrop-blur"
    >
      <MonitorPlay size={14} />
      <span>{t("presentation.banner")}</span>
      <button
        type="button"
        onClick={exitPresentationMode}
        className="ml-1 flex items-center gap-1 rounded-full px-2 py-0.5 text-amber-200 hover:bg-amber-500/25 transition-colors"
      >
        <X size={12} />
        {t("presentation.exit")}
      </button>
    </div>
  );
};
