import { formatCellValue } from './dataGrid';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';

export function rowToCSV(row: unknown[], nullLabel: string = "null", delimiter: string = ","): string {
  return row
    .map((cell) => formatCellValue(cell, nullLabel))
    .join(delimiter);
}

export function rowsToCSV(rows: unknown[][], nullLabel: string = "null", delimiter: string = ","): string {
  return rows
    .map((row) => rowToCSV(row, nullLabel, delimiter))
    .join("\n");
}

export function rowsToCSVWithHeaders(rows: unknown[][], columns: string[], nullLabel: string = "null", delimiter: string = ","): string {
  const header = columns.join(delimiter);
  const body = rowsToCSV(rows, nullLabel, delimiter);
  return body ? `${header}\n${body}` : header;
}

export function rowToJSON(row: unknown[], columns: string[]): string {
  const obj: Record<string, unknown> = {};
  columns.forEach((col, i) => {
    obj[col] = row[i] ?? null;
  });
  return JSON.stringify(obj);
}

export function rowsToJSON(rows: unknown[][], columns: string[]): string {
  return JSON.stringify(
    rows.map((row) => {
      const obj: Record<string, unknown> = {};
      columns.forEach((col, i) => {
        obj[col] = row[i] ?? null;
      });
      return obj;
    }),
  );
}

export function getSelectedRows(
  data: unknown[][],
  selectedIndices: Set<number>
): unknown[][] {
  const sortedIndices = Array.from(selectedIndices).sort((a, b) => a - b);
  return sortedIndices.map((idx) => data[idx]);
}

function sqlValue(cell: unknown): string {
  if (cell === null || cell === undefined) return "NULL";
  if (typeof cell === "boolean") return cell ? "TRUE" : "FALSE";
  if (typeof cell === "number") return String(cell);
  const str = typeof cell === "object" ? JSON.stringify(cell) : String(cell);
  return `'${str.replace(/'/g, "''")}'`;
}

function rowToSqlInsert(
  row: unknown[],
  columns: string[],
  tableName: string,
): string {
  const cols = columns.map((c) => `\`${c}\``).join(", ");
  const vals = row.map(sqlValue).join(", ");
  return `INSERT INTO \`${tableName}\` (${cols}) VALUES (${vals});`;
}

export function rowsToSqlInsert(
  rows: unknown[][],
  columns: string[],
  tableName: string,
): string {
  return rows.map((row) => rowToSqlInsert(row, columns, tableName)).join("\n");
}

export function rowsToMarkdownTable(
  rows: unknown[][],
  columns: string[],
  nullLabel: string = "null"
): string {
  if (columns.length === 0) return "";

  const escapeCell = (cell: unknown): string => {
    if (cell === null || cell === undefined) return nullLabel;
    const str = typeof cell === "object" ? JSON.stringify(cell) : String(cell);
    return str.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
  };

  const header = `| ${columns.map((c) => c.replace(/\|/g, "\\|")).join(" | ")} |`;
  const separator = `| ${columns.map(() => "---").join(" | ")} |`;

  if (rows.length === 0) {
    return `${header}\n${separator}`;
  }

  const body = rows
    .map((row) => `| ${columns.map((_, i) => escapeCell(row[i])).join(" | ")} |`)
    .join("\n");

  return `${header}\n${separator}\n${body}`;
}

export function rowsToTypeScriptInterface(
  tableName: string,
  columns: string[],
  rows: unknown[][]
): string {
  if (columns.length === 0) return "export interface Row {\n}\n";

  const cleanName = (tableName || "Record")
    .replace(/[^a-zA-Z0-9_]/g, "")
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join("");
  const interfaceName = `${cleanName || "Record"}Row`;

  const inferTypeForColumn = (colIndex: number): string => {
    let hasNull = false;
    const types = new Set<string>();

    for (const row of rows) {
      const val = row[colIndex];
      if (val === null || val === undefined) {
        hasNull = true;
      } else if (typeof val === "boolean") {
        types.add("boolean");
      } else if (typeof val === "number") {
        types.add("number");
      } else if (typeof val === "string") {
        types.add("string");
      } else if (Array.isArray(val)) {
        types.add("unknown[]");
      } else if (typeof val === "object") {
        types.add("Record<string, unknown>");
      } else {
        types.add("unknown");
      }
    }

    if (types.size === 0) {
      return hasNull ? "unknown | null" : "unknown";
    }

    const union = Array.from(types).join(" | ");
    return hasNull ? `${union} | null` : union;
  };

  const lines = columns.map((col, idx) => {
    const validIdentifier = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(col);
    const key = validIdentifier ? col : JSON.stringify(col);
    const tsType = inferTypeForColumn(idx);
    return `  ${key}: ${tsType};`;
  });

  return `export interface ${interfaceName} {\n${lines.join("\n")}\n}\n`;
}

export async function copyTextToClipboard(
  text: string,
  onError?: (error: unknown) => void
): Promise<void> {
  let copied = false;
  // 1. Write to Tauri native clipboard manager if available
  try {
    await writeText(text);
    copied = true;
  } catch (_e) {
    // Non-tauri or permission fallback
  }

  // 2. Write to browser clipboard API
  try {
    if (
      typeof navigator !== 'undefined' &&
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === 'function'
    ) {
      await navigator.clipboard.writeText(text);
      copied = true;
    }
  } catch (e) {
    if (!copied) {
      console.error("Copy failed:", e);
      if (onError) {
        onError(e);
      } else {
        throw e;
      }
    }
  }
}
