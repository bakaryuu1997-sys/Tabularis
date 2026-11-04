import type { DriverCapabilities, PluginManifest } from "../types/plugins";
import { quoteIdentifier, quoteTableRef } from "./identifiers";

/**
 * Live Tail helpers.
 *
 * Two strategies exist:
 * - "keyset": for a table tab with a single integer primary key. A tiny indexed probe
 *   (`WHERE pk > last`) detects new rows and the real query only re-runs when something arrived.
 * - "snapshot": for everything else (console queries, composite or non-numeric keys). The query is
 *   re-run on each tick and the result is compared with the previous one.
 */

export type LiveTailStrategy = "keyset" | "snapshot";

type DriverLike = string | PluginManifest | DriverCapabilities | null | undefined;

/** Hard ceiling for the polling delay after repeated failures. */
export const MAX_POLL_DELAY_MS = 60_000;

/** Consecutive failures after which Live Tail stops itself. */
export const MAX_CONSECUTIVE_FAILURES = 5;

/** How many new keys a single probe asks for. Extra rows are picked up on the next tick. */
export const KEYSET_PROBE_LIMIT = 1000;

export interface LiveTailDeltaResult {
  newRowCount: number;
  newRowIndices: number[];
  /** Rows whose primary key existed before but whose other values changed (needs a primary key). */
  updatedRowIndices: number[];
  /** Rows that were present before and are gone now. */
  removedRowCount: number;
  hasChanges: boolean;
}

function stringifyValue(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  if (typeof val === "object") {
    try {
      return JSON.stringify(val);
    } catch {
      return String(val);
    }
  }
  return String(val);
}

/**
 * Deterministic signature of a row. With primary-key indexes it identifies the row; without them it
 * fingerprints the whole row. Values are JSON-encoded as a list, so ["a|b"] and ["a","b"] never collide.
 */
export function computeRowSignature(row: unknown[], pkIndices: number[] = []): string {
  const values = pkIndices.length > 0 ? pkIndices.map((idx) => row[idx]) : row;
  return JSON.stringify(values.map(stringifyValue));
}

/**
 * Compares two result snapshots.
 *
 * With primary keys: new = key not seen before, updated = key seen but contents changed,
 * removed = key no longer present. Without keys: rows are compared as a multiset, so duplicate rows are
 * counted correctly and an edited row shows up as one removal plus one new row.
 */
export function detectRowDeltas(
  previousRows: unknown[][],
  currentRows: unknown[][],
  pkIndices: number[] = [],
): LiveTailDeltaResult {
  const empty: LiveTailDeltaResult = {
    newRowCount: 0,
    newRowIndices: [],
    updatedRowIndices: [],
    removedRowCount: 0,
    hasChanges: false,
  };
  if (!previousRows || previousRows.length === 0) return empty;

  const newRowIndices: number[] = [];
  const updatedRowIndices: number[] = [];
  let removedRowCount = 0;

  if (pkIndices.length > 0) {
    const previousByKey = new Map<string, string>();
    for (const row of previousRows) {
      previousByKey.set(computeRowSignature(row, pkIndices), computeRowSignature(row));
    }
    const currentKeys = new Set<string>();
    currentRows.forEach((row, i) => {
      const key = computeRowSignature(row, pkIndices);
      currentKeys.add(key);
      const before = previousByKey.get(key);
      if (before === undefined) newRowIndices.push(i);
      else if (before !== computeRowSignature(row)) updatedRowIndices.push(i);
    });
    for (const key of previousByKey.keys()) if (!currentKeys.has(key)) removedRowCount++;
  } else {
    const remaining = new Map<string, number>();
    for (const row of previousRows) {
      const sig = computeRowSignature(row);
      remaining.set(sig, (remaining.get(sig) ?? 0) + 1);
    }
    currentRows.forEach((row, i) => {
      const sig = computeRowSignature(row);
      const left = remaining.get(sig) ?? 0;
      if (left > 0) remaining.set(sig, left - 1);
      else newRowIndices.push(i);
    });
    for (const left of remaining.values()) removedRowCount += left;
  }

  return {
    newRowCount: newRowIndices.length,
    newRowIndices,
    updatedRowIndices,
    removedRowCount,
    hasChanges: newRowIndices.length > 0 || updatedRowIndices.length > 0 || removedRowCount > 0,
  };
}

/** Validates the polling interval in seconds (between 1 and 60). */
export function normalizeLiveTailInterval(seconds: number): number {
  if (isNaN(seconds) || seconds < 1) return 3;
  if (seconds > 60) return 60;
  return Math.round(seconds);
}

/** Exponential backoff: the base interval doubles per consecutive failure, capped at one minute. */
export function nextPollDelayMs(baseSeconds: number, consecutiveFailures: number): number {
  const base = normalizeLiveTailInterval(baseSeconds) * 1000;
  const failures = Math.max(0, Math.min(consecutiveFailures, 10));
  return Math.min(base * 2 ** failures, MAX_POLL_DELAY_MS);
}

export interface KeysetTarget {
  table: string;
  schema: string | null;
  pkColumn: string;
}

interface TailTabLike {
  type?: string;
  activeTable?: string | null;
  pkColumns?: string[] | null;
  schema?: string | null;
}

/** A keyset probe needs a table tab with exactly one primary-key column. */
export function resolveKeysetTarget(tab: TailTabLike | null | undefined): KeysetTarget | null {
  if (!tab || tab.type !== "table" || !tab.activeTable) return null;
  if (!tab.pkColumns || tab.pkColumns.length !== 1) return null;
  return { table: tab.activeTable, schema: tab.schema ?? null, pkColumn: tab.pkColumns[0] };
}

/**
 * Turns a key value read from the database into a safe SQL numeric literal, or null when the key is
 * not a plain integer. Only integers are supported, so no string escaping is ever involved.
 */
export function toKeysetLiteral(value: unknown): string | null {
  if (typeof value === "number") return Number.isSafeInteger(value) ? String(value) : null;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string" && /^-?\d{1,38}$/.test(value.trim())) return value.trim();
  return null;
}

/** `SELECT MAX(pk)`: the cheap, index-backed way to find where to start tailing from. */
export function buildMaxKeyQuery(target: KeysetTarget, driver: DriverLike): string {
  return `SELECT MAX(${quoteIdentifier(target.pkColumn, driver)}) AS tail_max FROM ${quoteTableRef(target.table, driver, target.schema)}`;
}

/** Keys inserted after `afterLiteral`. Row limiting is left to the executor's `limit` argument. */
export function buildNewKeysQuery(target: KeysetTarget, driver: DriverLike, afterLiteral: string | null): string {
  const pk = quoteIdentifier(target.pkColumn, driver);
  const where = afterLiteral === null ? "" : ` WHERE ${pk} > ${afterLiteral}`;
  return `SELECT ${pk} FROM ${quoteTableRef(target.table, driver, target.schema)}${where} ORDER BY ${pk} ASC`;
}
