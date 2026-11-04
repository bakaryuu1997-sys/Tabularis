import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { DriverCapabilities, PluginManifest } from "../types/plugins";
import {
  buildMaxKeyQuery,
  buildNewKeysQuery,
  detectRowDeltas,
  KEYSET_PROBE_LIMIT,
  MAX_CONSECUTIVE_FAILURES,
  nextPollDelayMs,
  resolveKeysetTarget,
  toKeysetLiteral,
  type KeysetTarget,
  type LiveTailStrategy,
} from "../utils/liveTableTail";

type DriverLike = string | PluginManifest | DriverCapabilities | null | undefined;

export type LiveTailStatus = "idle" | "running" | "paused" | "error";

export interface LiveTailTab {
  id: string;
  type?: string;
  activeTable?: string | null;
  pkColumns?: string[] | null;
  schema?: string | null;
  isLoading?: boolean;
  result?: { columns?: string[]; rows: unknown[][] } | null;
}

export interface UseLiveTailOptions {
  enabled: boolean;
  intervalSeconds: number;
  connectionId: string | null | undefined;
  driver: DriverLike;
  tab: LiveTailTab | undefined;
  /** Re-runs the tab's own query from page 1. */
  refresh: () => unknown;
}

export interface LiveTailState {
  strategy: LiveTailStrategy | null;
  status: LiveTailStatus;
  newRowCount: number;
  error: string | null;
  clearNewRows: () => void;
}

interface QueryResultLike {
  rows: unknown[][];
}

interface LiveSession {
  key: string;
  status: LiveTailStatus;
  error: string | null;
  newRows: number;
}

/**
 * Live Tail for the active result tab.
 *
 * - Table tabs with a single integer primary key use a keyset probe: one `MAX(pk)` query to find the
 *   starting point, then a small `WHERE pk > last` query per tick. The tab's own query only re-runs when
 *   new rows really arrived, so an idle table costs almost nothing.
 * - Anything else re-runs the query each tick and diffs the snapshots.
 *
 * Polling backs off exponentially after errors, stops after repeated failures and skips ticks while the
 * document is hidden or the tab is still loading.
 */
export function useLiveTail({
  enabled,
  intervalSeconds,
  connectionId,
  driver,
  tab,
  refresh,
}: UseLiveTailOptions): LiveTailState {
  const tabId = tab?.id;
  const keysetTarget = resolveKeysetTarget(tab);
  const targetKey = keysetTarget
    ? `${keysetTarget.schema ?? ""}|${keysetTarget.table}|${keysetTarget.pkColumn}`
    : "";

  // A table whose key turns out not to be an integer falls back to snapshot polling for this session.
  const [downgradedKey, setDowngradedKey] = useState<string | null>(null);
  const baseKey = `${tabId ?? ""}|${targetKey}|${intervalSeconds}|${connectionId ?? ""}`;
  const useKeyset = enabled && keysetTarget !== null && downgradedKey !== baseKey;
  const strategy: LiveTailStrategy | null = enabled && tab ? (useKeyset ? "keyset" : "snapshot") : null;
  const sessionKey = `${baseKey}|${strategy}`;

  const [session, setSession] = useState<LiveSession>({ key: "", status: "idle", error: null, newRows: 0 });
  const current: LiveSession = session.key === sessionKey ? session : { key: sessionKey, status: "idle", error: null, newRows: 0 };

  // Latest values for the timer callbacks, without restarting the loop on every render.
  const latest = useRef({ tab, driver, refresh });
  useEffect(() => {
    latest.current = { tab, driver, refresh };
  });

  useEffect(() => {
    if (!enabled || !connectionId || !tabId) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;
    // undefined = not initialised yet; null = empty table (tail from the first row).
    let baseline: string | null | undefined;

    const update = (patch: Partial<LiveSession>) =>
      setSession((prev) => ({ ...(prev.key === sessionKey ? prev : { key: sessionKey, status: "idle", error: null, newRows: 0 }), ...patch }));
    const addRows = (n: number) =>
      setSession((prev) => {
        const base = prev.key === sessionKey ? prev : { key: sessionKey, status: "idle" as const, error: null, newRows: 0 };
        return { ...base, newRows: base.newRows + n };
      });

    const run = async (target: KeysetTarget, sql: string, limit: number) =>
      invoke<QueryResultLike>("execute_query", {
        connectionId,
        query: sql,
        limit,
        page: 1,
        schema: target.schema,
      });

    const keysetTick = async (target: KeysetTarget) => {
      const drv = latest.current.driver;
      if (baseline === undefined) {
        const res = await run(target, buildMaxKeyQuery(target, drv), 1);
        const raw = res.rows[0]?.[0];
        if (raw === null || raw === undefined) {
          baseline = null;
        } else {
          const literal = toKeysetLiteral(raw);
          if (literal === null) {
            setDowngradedKey(baseKey);
            return false;
          }
          baseline = literal;
        }
        return true;
      }
      const res = await run(target, buildNewKeysQuery(target, drv, baseline), KEYSET_PROBE_LIMIT);
      if (res.rows.length > 0) {
        const literal = toKeysetLiteral(res.rows[res.rows.length - 1][0]);
        if (literal === null) {
          setDowngradedKey(baseKey);
          return false;
        }
        baseline = literal;
        addRows(res.rows.length);
        void latest.current.refresh();
      }
      return true;
    };

    const tick = async () => {
      if (cancelled) return;
      const snapshotTab = latest.current.tab;
      if (document.hidden || snapshotTab?.isLoading) {
        update({ status: "paused" });
        schedule();
        return;
      }
      try {
        if (useKeyset && keysetTarget) {
          const stillKeyset = await keysetTick(keysetTarget);
          if (cancelled || !stillKeyset) return;
        } else {
          void latest.current.refresh();
        }
        failures = 0;
        update({ status: "running", error: null });
      } catch (err) {
        failures += 1;
        if (failures >= MAX_CONSECUTIVE_FAILURES) {
          update({ status: "error", error: String(err) });
          return;
        }
        update({ status: "running", error: String(err) });
      }
      schedule();
    };

    function schedule(delay?: number) {
      if (cancelled) return;
      timer = setTimeout(tick, delay ?? nextPollDelayMs(intervalSeconds, failures));
    }

    // The keyset strategy needs its baseline right away; snapshot polling waits one interval.
    schedule(useKeyset ? 0 : undefined);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // keysetTarget is derived from baseKey's inputs, which are all part of the dependency list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, connectionId, tabId, intervalSeconds, useKeyset, sessionKey, baseKey, targetKey]);

  // Snapshot strategy: compare each new result with the previous one (derived state, no effect).
  const rows = tab?.result?.rows ?? null;
  const [previousRows, setPreviousRows] = useState(rows);
  if (rows !== previousRows) {
    setPreviousRows(rows);
    if (strategy === "snapshot" && previousRows && rows) {
      const columns = tab?.result?.columns ?? [];
      const pkIndices = (tab?.pkColumns ?? []).map((c) => columns.indexOf(c)).filter((i) => i >= 0);
      const delta = detectRowDeltas(previousRows, rows, pkIndices);
      if (delta.newRowCount > 0) {
        setSession((prev) => {
          const base = prev.key === sessionKey ? prev : { key: sessionKey, status: "idle" as const, error: null, newRows: 0 };
          return { ...base, newRows: base.newRows + delta.newRowCount };
        });
      }
    }
  }

  return {
    strategy,
    status: enabled ? (current.status === "idle" ? "running" : current.status) : "idle",
    newRowCount: enabled ? current.newRows : 0,
    error: current.error,
    clearNewRows: () =>
      setSession((prev) => ({
        ...(prev.key === sessionKey ? prev : { key: sessionKey, status: "idle", error: null, newRows: 0 }),
        newRows: 0,
      })),
  };
}
