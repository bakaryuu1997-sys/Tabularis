export type HighlightOperator =
  | "="
  | "!="
  | ">"
  | ">="
  | "<"
  | "<="
  | "contains"
  | "not_contains"
  | "starts_with"
  | "ends_with"
  | "is_null"
  | "is_not_null";

export type HighlightColorScheme =
  | "red"
  | "green"
  | "amber"
  | "blue"
  | "purple"
  | "emerald"
  | "rose"
  | "indigo"
  | "cyan"
  | "gray";

export type HighlightTarget = "row" | "cell";

export interface HighlightRule {
  id: string;
  column: string;
  operator: HighlightOperator;
  value: string;
  colorScheme: HighlightColorScheme;
  target: HighlightTarget;
  enabled: boolean;
}

export interface HighlightStyleDef {
  rowClass: string;
  cellClass: string;
  badgeClass: string;
  borderClass: string;
  label: string;
  hex: string;
}

export const HIGHLIGHT_COLOR_SCHEMES: Record<HighlightColorScheme, HighlightStyleDef> = {
  red: {
    rowClass: "bg-red-500/15 hover:bg-red-500/25",
    cellClass: "bg-red-500/20 text-red-200 border-l-2 border-red-500",
    badgeClass: "bg-red-500/20 text-red-300 border-red-500/30",
    borderClass: "border-red-500",
    label: "Red (Đỏ)",
    hex: "#ef4444",
  },
  green: {
    rowClass: "bg-emerald-500/15 hover:bg-emerald-500/25",
    cellClass: "bg-emerald-500/20 text-emerald-200 border-l-2 border-emerald-500",
    badgeClass: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    borderClass: "border-emerald-500",
    label: "Emerald (Xanh lá)",
    hex: "#10b981",
  },
  amber: {
    rowClass: "bg-amber-500/15 hover:bg-amber-500/25",
    cellClass: "bg-amber-500/20 text-amber-200 border-l-2 border-amber-500",
    badgeClass: "bg-amber-500/20 text-amber-300 border-amber-500/30",
    borderClass: "border-amber-500",
    label: "Amber (Vàng hổ phách)",
    hex: "#f59e0b",
  },
  blue: {
    rowClass: "bg-blue-500/15 hover:bg-blue-500/25",
    cellClass: "bg-blue-500/20 text-blue-200 border-l-2 border-blue-500",
    badgeClass: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    borderClass: "border-blue-500",
    label: "Blue (Xanh dương)",
    hex: "#3b82f6",
  },
  purple: {
    rowClass: "bg-purple-500/15 hover:bg-purple-500/25",
    cellClass: "bg-purple-500/20 text-purple-200 border-l-2 border-purple-500",
    badgeClass: "bg-purple-500/20 text-purple-300 border-purple-500/30",
    borderClass: "border-purple-500",
    label: "Purple (Tím)",
    hex: "#a855f7",
  },
  rose: {
    rowClass: "bg-rose-500/15 hover:bg-rose-500/25",
    cellClass: "bg-rose-500/20 text-rose-200 border-l-2 border-rose-500",
    badgeClass: "bg-rose-500/20 text-rose-300 border-rose-500/30",
    borderClass: "border-rose-500",
    label: "Rose (Hồng hoa hồng)",
    hex: "#f43f5e",
  },
  emerald: {
    rowClass: "bg-teal-500/15 hover:bg-teal-500/25",
    cellClass: "bg-teal-500/20 text-teal-200 border-l-2 border-teal-500",
    badgeClass: "bg-teal-500/20 text-teal-300 border-teal-500/30",
    borderClass: "border-teal-500",
    label: "Teal (Xanh mòng két)",
    hex: "#14b8a6",
  },
  indigo: {
    rowClass: "bg-indigo-500/15 hover:bg-indigo-500/25",
    cellClass: "bg-indigo-500/20 text-indigo-200 border-l-2 border-indigo-500",
    badgeClass: "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
    borderClass: "border-indigo-500",
    label: "Indigo (Chàm)",
    hex: "#6366f1",
  },
  cyan: {
    rowClass: "bg-cyan-500/15 hover:bg-cyan-500/25",
    cellClass: "bg-cyan-500/20 text-cyan-200 border-l-2 border-cyan-500",
    badgeClass: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
    borderClass: "border-cyan-500",
    label: "Cyan (Xanh lơ)",
    hex: "#06b6d4",
  },
  gray: {
    rowClass: "bg-zinc-500/15 hover:bg-zinc-500/25",
    cellClass: "bg-zinc-500/20 text-zinc-300 border-l-2 border-zinc-500",
    badgeClass: "bg-zinc-500/20 text-zinc-300 border-zinc-500/30",
    borderClass: "border-zinc-500",
    label: "Gray (Xám)",
    hex: "#71717a",
  },
};

export function getHighlightStyle(colorScheme: HighlightColorScheme): HighlightStyleDef {
  return HIGHLIGHT_COLOR_SCHEMES[colorScheme] ?? HIGHLIGHT_COLOR_SCHEMES.amber;
}

/**
 * Evaluates whether a single cell value matches the highlight rule.
 */
export function evaluateHighlightRule(cellValue: unknown, rule: HighlightRule): boolean {
  if (!rule.enabled) return false;

  const isNullish = cellValue === null || cellValue === undefined;

  if (rule.operator === "is_null") {
    return isNullish;
  }
  if (rule.operator === "is_not_null") {
    return !isNullish;
  }

  // If value is null and rule requires comparison, it does not match
  if (isNullish) {
    return false;
  }

  const strCellValue = String(cellValue).trim();
  const ruleVal = rule.value.trim();

  // Try numeric comparison if both are valid numbers
  const cellNum = Number(strCellValue);
  const ruleNum = Number(ruleVal);
  const areBothNumbers =
    strCellValue !== "" &&
    ruleVal !== "" &&
    !Number.isNaN(cellNum) &&
    !Number.isNaN(ruleNum);

  switch (rule.operator) {
    case "=":
      if (areBothNumbers) return cellNum === ruleNum;
      return strCellValue.toLowerCase() === ruleVal.toLowerCase();

    case "!=":
      if (areBothNumbers) return cellNum !== ruleNum;
      return strCellValue.toLowerCase() !== ruleVal.toLowerCase();

    case ">":
      if (areBothNumbers) return cellNum > ruleNum;
      return strCellValue.localeCompare(ruleVal) > 0;

    case ">=":
      if (areBothNumbers) return cellNum >= ruleNum;
      return strCellValue.localeCompare(ruleVal) >= 0;

    case "<":
      if (areBothNumbers) return cellNum < ruleNum;
      return strCellValue.localeCompare(ruleVal) < 0;

    case "<=":
      if (areBothNumbers) return cellNum <= ruleNum;
      return strCellValue.localeCompare(ruleVal) <= 0;

    case "contains":
      return strCellValue.toLowerCase().includes(ruleVal.toLowerCase());

    case "not_contains":
      return !strCellValue.toLowerCase().includes(ruleVal.toLowerCase());

    case "starts_with":
      return strCellValue.toLowerCase().startsWith(ruleVal.toLowerCase());

    case "ends_with":
      return strCellValue.toLowerCase().endsWith(ruleVal.toLowerCase());

    default:
      return false;
  }
}

/**
 * Result of evaluating highlight rules for an entire row.
 */
export interface RowHighlightEvaluation {
  rowRule?: HighlightRule;
  cellRules: Map<number, HighlightRule>;
}

/**
 * Evaluates all active highlight rules for a row of data against column definitions.
 */
export function evaluateRowHighlight(
  row: unknown[],
  columnNameToIndex: Map<string, number>,
  activeRules: HighlightRule[],
): RowHighlightEvaluation {
  const result: RowHighlightEvaluation = {
    cellRules: new Map(),
  };

  if (!activeRules.length || !row.length) {
    return result;
  }

  for (const rule of activeRules) {
    if (!rule.enabled) continue;

    const colIndex = columnNameToIndex.get(rule.column);
    if (colIndex === undefined || colIndex < 0 || colIndex >= row.length) {
      continue;
    }

    const cellValue = row[colIndex];
    if (evaluateHighlightRule(cellValue, rule)) {
      if (rule.target === "row") {
        // First matching row rule wins
        if (!result.rowRule) {
          result.rowRule = rule;
        }
      } else {
        // Target is cell
        if (!result.cellRules.has(colIndex)) {
          result.cellRules.set(colIndex, rule);
        }
      }
    }
  }

  return result;
}

export function buildHighlightStorageKey(
  connectionId?: string | null,
  schema?: string | null,
  tableName?: string | null,
): string | null {
  if (!tableName) return null;
  const parts = ["tabularis_highlight_rules"];
  if (connectionId) parts.push(connectionId);
  if (schema) parts.push(schema);
  parts.push(tableName);
  return parts.join(":");
}

export function loadHighlightRules(storageKey: string | null): HighlightRule[] {
  if (!storageKey) return [];
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return [];
  } catch {
    return [];
  }
}

export function saveHighlightRules(
  storageKey: string | null,
  rules: HighlightRule[],
): void {
  if (!storageKey) return;
  try {
    if (rules.length === 0) {
      localStorage.removeItem(storageKey);
    } else {
      localStorage.setItem(storageKey, JSON.stringify(rules));
    }
  } catch {
    // Ignore storage quota errors
  }
}
