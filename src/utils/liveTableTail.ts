export interface LiveTailDeltaResult {
  newRowCount: number;
  newRowIndices: number[];
  hasChanges: boolean;
}

/**
 * Computes a fast, deterministic hash/signature for a row of values.
 */
export function computeRowSignature(row: unknown[], pkIndices: number[] = []): string {
  if (pkIndices.length > 0) {
    return pkIndices.map((idx) => String(row[idx] ?? "null")).join("::");
  }
  return row.map((val) => (val === null || val === undefined ? "null" : String(val))).join("|");
}

/**
 * Compares two row snapshots and identifies freshly inserted rows.
 */
export function detectRowDeltas(
  previousRows: unknown[][],
  currentRows: unknown[][],
  pkIndices: number[] = []
): LiveTailDeltaResult {
  if (!previousRows || previousRows.length === 0) {
    return {
      newRowCount: 0,
      newRowIndices: [],
      hasChanges: false,
    };
  }

  const prevSignatures = new Set(previousRows.map((r) => computeRowSignature(r, pkIndices)));
  const newRowIndices: number[] = [];

  for (let i = 0; i < currentRows.length; i++) {
    const sig = computeRowSignature(currentRows[i], pkIndices);
    if (!prevSignatures.has(sig)) {
      newRowIndices.push(i);
    }
  }

  return {
    newRowCount: newRowIndices.length,
    newRowIndices,
    hasChanges: newRowIndices.length > 0 || currentRows.length !== previousRows.length,
  };
}

/**
 * Validates polling interval in seconds (between 1 and 60 seconds).
 */
export function normalizeLiveTailInterval(seconds: number): number {
  if (isNaN(seconds) || seconds < 1) return 3;
  if (seconds > 60) return 60;
  return Math.round(seconds);
}
