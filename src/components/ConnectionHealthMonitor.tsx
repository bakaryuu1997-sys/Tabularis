import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { useAlert } from "../hooks/useAlert";
import { useDatabase } from "../hooks/useDatabase";
import { RECONNECT_DELAYS_MS, reconnectAttemptCount } from "../utils/reconnect";

interface ReconnectProgress {
  attempt: number;
  maxAttempts: number;
}

/**
 * Listens for backend `connection-health-failed` events and reconnects the
 * failed connection with backoff, showing a small status pill meanwhile.
 *
 * This is the only auto-reconnect path: the backend health check has already
 * closed the pools and released the tunnel before emitting the event. Each
 * connection has its own retry loop; a new failure event for the same
 * connection cancels the previous loop.
 */
export function ConnectionHealthMonitor() {
  const { showAlert } = useAlert();
  const { t } = useTranslation();
  const { connect } = useDatabase();
  const [progress, setProgress] = useState<Record<string, ReconnectProgress>>({});

  // Read through refs so the event subscription stays stable across renders.
  const connectRef = useRef(connect);
  const showAlertRef = useRef(showAlert);
  const tRef = useRef(t);
  useEffect(() => {
    connectRef.current = connect;
    showAlertRef.current = showAlert;
    tRef.current = t;
  });

  // Incremented per connection to cancel an older loop; cleared on unmount.
  const runIdsRef = useRef<Record<string, number>>({});
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  useEffect(() => {
    let disposed = false;
    const timers = timersRef.current;
    const maxAttempts = reconnectAttemptCount();

    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          timers.delete(timer);
          resolve();
        }, ms);
        timers.add(timer);
      });

    const setAttempt = (connectionId: string, attempt: number | null) =>
      setProgress((prev) => {
        const next = { ...prev };
        if (attempt === null) delete next[connectionId];
        else next[connectionId] = { attempt, maxAttempts };
        return next;
      });

    const reconnect = async (connectionId: string) => {
      const runId = (runIdsRef.current[connectionId] ?? 0) + 1;
      runIdsRef.current[connectionId] = runId;
      const cancelled = () => disposed || runIdsRef.current[connectionId] !== runId;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        if (cancelled()) return;
        setAttempt(connectionId, attempt);
        try {
          await connectRef.current(connectionId);
          if (!cancelled()) setAttempt(connectionId, null);
          return;
        } catch {
          // No wait after the final attempt.
          if (attempt < maxAttempts) await wait(RECONNECT_DELAYS_MS[attempt - 1]);
        }
      }

      if (cancelled()) return;
      setAttempt(connectionId, null);
      showAlertRef.current(tRef.current("healthCheck.reconnectFailed"), {
        kind: "error",
        title: tRef.current("healthCheck.title"),
      });
    };

    const unlisten = listen<{ connectionId: string; error: string }>(
      "connection-health-failed",
      (event) => {
        const { connectionId, error } = event.payload;
        showAlertRef.current(`${tRef.current("healthCheck.connectionLost")}: ${error}`, {
          kind: "warning",
          title: tRef.current("healthCheck.title"),
        });
        if (connectionId) void reconnect(connectionId);
      },
    );

    return () => {
      disposed = true;
      timers.forEach(clearTimeout);
      timers.clear();
      unlisten.then((fn) => fn());
    };
  }, []);

  const entries = Object.values(progress);
  if (entries.length === 0) return null;
  const { attempt, maxAttempts } = entries[0];

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-3 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 px-4 py-2 rounded-full bg-amber-500/90 text-white text-xs font-medium shadow-lg backdrop-blur border border-amber-400/40 pointer-events-none select-none"
    >
      <Loader2 className="w-3.5 h-3.5 animate-spin" />
      <span>
        {t("healthCheck.reconnecting")} ({attempt}/{maxAttempts})
        {entries.length > 1 ? ` +${entries.length - 1}` : ""}
      </span>
    </div>
  );
}
