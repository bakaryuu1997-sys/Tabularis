import { buildXlsx } from "./xlsxWriter";
import { bytesToBase64 } from "./base64";
import { save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";

export interface ExcelExportOptions {
  columns: string[];
  rows: unknown[][];
  defaultFileName?: string;
  sheetName?: string;
}

/**
 * Formats a single cell value for Excel insertion.
 */
function formatCellForExcel(val: unknown): string | number | boolean | null {
  if (val === null || val === undefined) return null;
  if (typeof val === "number" || typeof val === "boolean") return val;
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
 * Calculates optimal column widths in character units.
 */
function calculateColumnWidths(columns: string[], rows: unknown[][]): { wch: number }[] {
  const sampleLimit = Math.min(rows.length, 500);

  return columns.map((col, colIdx) => {
    let maxLen = col ? String(col).length : 5;

    for (let r = 0; r < sampleLimit; r++) {
      const val = rows[r]?.[colIdx];
      if (val !== null && val !== undefined) {
        const strVal = typeof val === "object" ? JSON.stringify(val) : String(val);
        if (strVal.length > maxLen) {
          maxLen = strVal.length;
        }
      }
    }

    // Min 10 chars, max 60 chars, padding of 3
    const width = Math.min(Math.max(maxLen + 3, 10), 60);
    return { wch: width };
  });
}

/**
 * Exports tabular data directly to an Excel (.xlsx) file with auto column widths and UTF-8 encoding.
 * Returns the file path saved, or null if cancelled.
 */
export async function exportQueryResultToExcel({
  columns,
  rows,
  defaultFileName = `query_result_${Date.now()}.xlsx`,
  sheetName = "Query Results",
}: ExcelExportOptions): Promise<string | null> {
  const filePath = await save({
    defaultPath: defaultFileName,
    filters: [
      {
        name: "Excel Spreadsheet (*.xlsx)",
        extensions: ["xlsx"],
      },
    ],
  });

  if (!filePath) return null;

  // Format data rows (the header row is written separately by the XLSX writer)
  const formattedRows = rows.map((row) =>
    columns.map((_, colIdx) => formatCellForExcel(row[colIdx])),
  );

  const base64Data = bytesToBase64(
    buildXlsx({
      name: sheetName,
      columns,
      rows: formattedRows,
      columnWidths: calculateColumnWidths(columns, rows).map((w) => w.wch),
    }),
  );

  await invoke("write_binary_file", {
    path: filePath,
    base64Data,
  });

  return filePath;
}
