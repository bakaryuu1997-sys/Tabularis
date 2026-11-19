import { useEffect, useState, useRef, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { useAlert } from "../hooks/useAlert";
import { useDatabase } from "../hooks/useDatabase";

const BACKOFF_DELAYS = [2000, 5000, 15000];

interface ReconnectingState {
  connectionId: string;
  attempt: number;
  maxAttempts: number;
}

/**
 * Component that listens for backend connection-health-failed events
 * and manages auto-reconnect with exponential backoff (2s, 5s, 15s) and a visible
 * status indicator, without flooding toasts or running polling SQL queries.
 */
export function ConnectionHealthMonitor() {
  const { showAlert } = useAlert();
  const { t } = useTranslation();
  const { connect } = useDatabase();
  const [reconnectingState, setReconnectingState] = useState<ReconnectingState | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, []);

  const attemptReconnect = useCallback(
    async (connectionId: string) => {
      for (let attemptIndex = 0; attemptIndex < BACKOFF_DELAYS.length; attemptIndex++) {
        setReconnectingState({
          connectionId,
          attempt: attemptIndex + 1,
          maxAttempts: BACKOFF_DELAYS.length,
        });

        try {
          await connect(connectionId);
          // Reconnected successfully
          setReconnectingState(null);
          return;
        } catch {
          // Wait for the backoff delay before the next retry
          const delay = BACKOFF_DELAYS[attemptIndex];
          await new Promise<void>((resolve) => {
            reconnectTimeoutRef.current = setTimeout(resolve, delay);
          });
        }
      }

      // Failed after all backoff retries
      setReconnectingState(null);
      showAlert(
        t("healthCheck.reconnectFailed", {
          defaultValue: "Could not reconnect to database after multiple attempts.",
        }),
        {
          kind: "error",
          title: t("healthCheck.title"),
        }
      );
    },
    [connect, showAlert, t]
  );

  useEffect(() => {
    const unlisten = listen<{ connectionId: string; error: string }>(
      "connection-health-failed",
      (event) => {
        const { connectionId, error } = event.payload;
        showAlert(
          `${t("healthCheck.connectionLost")}: ${error}`,
          {
            kind: "warning",
            title: t("healthCheck.title"),
          },
        );
        if (connectionId) {
          if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
          }
          attemptReconnect(connectionId);
        }
      },
    );
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [attemptReconnect, showAlert, t]);

  if (!reconnectingState) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-3 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 px-4 py-2 rounded-full bg-amber-500/90 text-white text-xs font-medium shadow-lg backdrop-blur border border-amber-400/40 animate-pulse pointer-events-none select-none"
    >
      <Loader2 className="w-3.5 h-3.5 animate-spin" />
      <span>
        {t("healthCheck.reconnecting", {
          defaultValue: "Reconnecting to database...",
        })}{" "}
        ({reconnectingState.attempt}/{reconnectingState.maxAttempts})
      </span>
    </div>
  );
}
