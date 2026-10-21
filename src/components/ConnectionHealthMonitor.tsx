import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useTranslation } from "react-i18next";
import { useAlert } from "../hooks/useAlert";

/**
 * Headless component that listens for backend connection-health-failed events
 * and shows an alert toast. Does NOT forcefully navigate away, preserving user query work.
 */
export function ConnectionHealthMonitor() {
  const { showAlert } = useAlert();
  const { t } = useTranslation();

  useEffect(() => {
    const unlisten = listen<{ connectionId: string; error: string }>(
      "connection-health-failed",
      (event) => {
        const { error } = event.payload;
        showAlert(
          `${t("healthCheck.connectionLost")}: ${error}`,
          {
            kind: "error",
            title: t("healthCheck.title"),
          },
        );
      },
    );
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [showAlert, t]);

  return null;
}
