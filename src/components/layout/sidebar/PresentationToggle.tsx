import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { MonitorPlay } from "lucide-react";
import { usePresentationMode } from "../../../hooks/usePresentationMode";

/** Sidebar button that turns presentation mode on and off. Looks like the other sidebar items. */
export const PresentationToggle = () => {
  const { t } = useTranslation();
  const { isPresentationMode, togglePresentationMode } = usePresentationMode();
  const label = t("sidebar.presentationMode");

  return (
    <button
      type="button"
      onClick={togglePresentationMode}
      aria-pressed={isPresentationMode}
      aria-label={label}
      className={clsx(
        "flex items-center justify-center w-12 h-12 rounded-lg transition-colors mb-2 relative group",
        isPresentationMode
          ? "bg-amber-500 text-black"
          : "text-muted hover:bg-surface-secondary hover:text-primary",
      )}
    >
      <MonitorPlay size={24} />
      <span className="absolute left-14 bg-surface-secondary text-primary text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-30 pointer-events-none">
        {label}
      </span>
    </button>
  );
};
