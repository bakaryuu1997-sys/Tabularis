import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { useAlert } from "../hooks/useAlert";
import { useDatabase } from "../hooks/useDatabase";

/**
 * Headless component that listens for backend connection-health-failed events
 * and shows an alert toast. Does NOT forcefully navigate away, preserving user query work.
 * Also runs a keep-alive heartbeat to prevent idle disconnects.
 */
export function ConnectionHealthMonitor() {
  const { showAlert } = useAlert();
  const { t } = useTranslation();
  const { activeConnectionId, connect } = useDatabase();

  useEffect(() => {
    const unlisten = listen<{ connectionId: string; error: string }>(
      "connection-health-failed",
      (event) => {
        const { connectionId, error } = event.payload;
        showAlert(
          `${t("healthCheck.connectionLost", { defaultValue: "Mất kết nối tới cơ sở dữ liệu" })}: ${error}`,
          {
            kind: "warning",
            title: t("healthCheck.title", { defaultValue: "Kiểm tra kết nối" }),
          },
        );
        if (connectionId) {
          connect(connectionId).catch(() => {});
        }
      },
    );
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [showAlert, t, connect]);

  // Keep-alive heartbeat: periodically ping active connection every 45s to avoid idle timeout
  useEffect(() => {
    if (!activeConnectionId) return;
    const timer = setInterval(() => {
      invoke("execute_query", {
        connectionId: activeConnectionId,
        query: "SELECT 1;",
      }).catch(() => {});
    }, 45000);

    return () => clearInterval(timer);
  }, [activeConnectionId]);

  return null;
}
