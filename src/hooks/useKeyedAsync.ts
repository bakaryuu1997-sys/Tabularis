import { useEffect, useRef, useState } from "react";

export type KeyedAsyncState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; value: T }
  | { status: "error"; message: string };

/**
 * Runs `fn` whenever `key` changes (and `enabled` is true) and exposes its result.
 *
 * The settled result is stored together with the key it belongs to, so a stale
 * result for an older key is never shown and no state is set synchronously inside
 * the effect. Superseded runs are ignored.
 */
export function useKeyedAsync<T>(
  key: string,
  enabled: boolean,
  fn: () => Promise<T>,
): KeyedAsyncState<T> {
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });

  const [settled, setSettled] = useState<{
    key: string;
    state: { status: "done"; value: T } | { status: "error"; message: string };
  } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fnRef
      .current()
      .then((value) => {
        if (!cancelled) setSettled({ key, state: { status: "done", value } });
      })
      .catch((err: unknown) => {
        if (!cancelled) setSettled({ key, state: { status: "error", message: String(err) } });
      });
    return () => {
      cancelled = true;
    };
  }, [key, enabled]);

  if (!enabled) return { status: "idle" };
  if (settled && settled.key === key) return settled.state;
  return { status: "loading" };
}
