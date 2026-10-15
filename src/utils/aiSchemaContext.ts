import type { TableSchema, ForeignKey } from "../types/editor";

export interface FormatSchemaOptions {
  maxTables?: number;
  maxCols?: number;
  sampleData?: Record<string, Record<string, unknown>[]>;
}

const SENSITIVE_COLUMN_REGEX =
  /^(password|passwd|secret|token|hash|auth|credit_card|cvv|api_key|private_key)$/i;

/** Mask sensitive values like passwords, tokens, or private keys. */
export function maskSensitiveValue(
  columnName: string,
  value: unknown,
): unknown {
  if (SENSITIVE_COLUMN_REGEX.test(columnName)) {
    return "***MASKED***";
  }
  return value;
}

/** Format a single foreign key relationship as `column -> table(target_column)`. */
export function formatForeignKeyString(fk: ForeignKey): string {
  const targetTable =
    fk.ref_table ||
    (fk as unknown as { foreign_table_name?: string }).foreign_table_name ||
    "";
  const targetCol =
    fk.ref_column ||
    (fk as unknown as { foreign_column_name?: string }).foreign_column_name ||
    "";
  return `${fk.column_name} -> ${targetTable}(${targetCol})`;
}

/**
 * Build rich schema context including primary keys, column types, foreign keys,
 * and optional sample data rows to ground AI completions.
 */
export function buildRichSchemaContext(
  tables: TableSchema[],
  options: FormatSchemaOptions = {},
): string {
  const maxTables = options.maxTables ?? 500;
  const maxCols = options.maxCols ?? 100;

  const allTableNames = tables.map((t) => t.name);
  const header =
    tables.length > 0
      ? `Database Schema (${tables.length} tables total: ${allTableNames.join(", ")}):\n`
      : "";

  const lines = tables.slice(0, maxTables).map((tbl) => {
    const cols = tbl.columns
      .slice(0, maxCols)
      .map((c) => `${c.name} ${c.data_type}${c.is_pk ? " PK" : ""}`)
      .join(", ");
    const moreCols =
      tbl.columns.length > maxCols
        ? `, …+${tbl.columns.length - maxCols} cols`
        : "";

    const fkParts = (tbl.foreign_keys || []).map(formatForeignKeyString);
    const fkString =
      fkParts.length > 0 ? `; FK: ${fkParts.join(", ")}` : "";

    return `${tbl.name}(${cols}${moreCols}${fkString})`;
  });

  if (tables.length > maxTables) {
    lines.push(`… and ${tables.length - maxTables} more tables`);
  }

  // If sample data rows are supplied, append them in a compact JSON snippet
  if (options.sampleData && Object.keys(options.sampleData).length > 0) {
    lines.push("\n--- Sample data preview (top rows) ---");
    for (const [tblName, rows] of Object.entries(options.sampleData)) {
      if (!Array.isArray(rows) || rows.length === 0) continue;
      const sanitizedRows = rows.slice(0, 5).map((row) => {
        const clean: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(row)) {
          clean[k] = maskSensitiveValue(k, v);
        }
        return clean;
      });
      lines.push(
        `Sample rows for ${tblName}:\n${JSON.stringify(sanitizedRows, null, 2)}`,
      );
    }
  }

  return (header + lines.join("\n")).trim();
}
