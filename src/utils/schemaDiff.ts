export interface TableColumn {
  name: string;
  data_type?: string;
  type?: string;
  is_pk?: boolean;
  is_primary?: boolean;
  is_nullable?: boolean;
  nullable?: boolean;
  default_value?: string | null;
}

export interface ColumnDiff {
  name: string;
  sourceType?: string;
  targetType?: string;
  sourceNullable?: boolean;
  targetNullable?: boolean;
  kind: "missing_in_target" | "extra_in_target" | "type_mismatch" | "nullability_mismatch";
}

export interface TableDiff {
  tableName: string;
  status: "source_only" | "target_only" | "different" | "identical";
  columnDiffs: ColumnDiff[];
  sourceColumns: TableColumn[];
  targetColumns: TableColumn[];
}

export interface SchemaDiffSummary {
  totalSourceTables: number;
  totalTargetTables: number;
  sourceOnlyCount: number;
  targetOnlyCount: number;
  differentCount: number;
  identicalCount: number;
}

export interface SchemaDiffResult {
  tables: TableDiff[];
  summary: SchemaDiffSummary;
  migrationSql: string;
}

export interface MinimalTableInfo {
  name: string;
  schema?: string;
}

/**
 * Normalizes SQL data type strings for tolerant comparison.
 */
function normalizeType(type: string): string {
  return type.toLowerCase().replace(/\s+/g, "").replace(/int4/g, "integer").replace(/int8/g, "bigint").replace(/bool/g, "boolean");
}

function getColType(c: TableColumn): string {
  return c.data_type || c.type || "text";
}

function getColNullable(c: TableColumn): boolean {
  if (c.nullable !== undefined) return c.nullable;
  if (c.is_nullable !== undefined) return c.is_nullable;
  return true;
}

function getColIsPk(c: TableColumn): boolean {
  return Boolean(c.is_pk || c.is_primary);
}

/**
 * Compares two schemas (Source vs Target) and returns differences + compensating migration SQL.
 */
export function compareSchemas(
  sourceTables: MinimalTableInfo[],
  sourceColumnsMap: Record<string, TableColumn[]>,
  targetTables: MinimalTableInfo[],
  targetColumnsMap: Record<string, TableColumn[]>,
  dialect: string = "postgres",
): SchemaDiffResult {
  const quote = dialect === "mysql" ? "`" : '"';
  const tableDiffs: TableDiff[] = [];

  const sourceTableMap = new Map<string, MinimalTableInfo>();
  for (const t of sourceTables) {
    sourceTableMap.set(t.name.toLowerCase(), t);
  }

  const targetTableMap = new Map<string, MinimalTableInfo>();
  for (const t of targetTables) {
    targetTableMap.set(t.name.toLowerCase(), t);
  }

  const allTableNames = Array.from(
    new Set([...sourceTableMap.keys(), ...targetTableMap.keys()]),
  ).sort();

  let sourceOnlyCount = 0;
  let targetOnlyCount = 0;
  let differentCount = 0;
  let identicalCount = 0;

  const migrationStatements: string[] = [];

  for (const rawName of allTableNames) {
    const srcT = sourceTableMap.get(rawName);
    const tgtT = targetTableMap.get(rawName);

    const actualTableName = srcT?.name || tgtT?.name || rawName;
    const srcCols = srcT ? (sourceColumnsMap[srcT.name] || sourceColumnsMap[actualTableName] || []) : [];
    const tgtCols = tgtT ? (targetColumnsMap[tgtT.name] || targetColumnsMap[actualTableName] || []) : [];

    if (srcT && !tgtT) {
      // Table exists in source but missing in target -> Create Table
      sourceOnlyCount++;
      const colDefs = srcCols.map((c) => {
        const cType = getColType(c);
        let def = `  ${quote}${c.name}${quote} ${cType}`;
        if (getColIsPk(c)) def += " PRIMARY KEY";
        else if (!getColNullable(c)) def += " NOT NULL";
        if (c.default_value) def += ` DEFAULT ${c.default_value}`;
        return def;
      });
      const createSql = colDefs.length > 0
        ? `CREATE TABLE ${quote}${actualTableName}${quote} (\n${colDefs.join(",\n")}\n);`
        : `CREATE TABLE ${quote}${actualTableName}${quote} ();`;
      migrationStatements.push(createSql);

      tableDiffs.push({
        tableName: actualTableName,
        status: "source_only",
        columnDiffs: srcCols.map(c => ({
          name: c.name,
          sourceType: getColType(c),
          kind: "missing_in_target",
        })),
        sourceColumns: srcCols,
        targetColumns: [],
      });
    } else if (!srcT && tgtT) {
      // Table exists in target but not in source
      targetOnlyCount++;
      tableDiffs.push({
        tableName: actualTableName,
        status: "target_only",
        columnDiffs: tgtCols.map(c => ({
          name: c.name,
          targetType: getColType(c),
          kind: "extra_in_target",
        })),
        sourceColumns: [],
        targetColumns: tgtCols,
      });
    } else {
      // Both have table -> compare columns
      const colDiffs: ColumnDiff[] = [];
      const srcColMap = new Map<string, TableColumn>();
      for (const c of srcCols) srcColMap.set(c.name.toLowerCase(), c);

      const tgtColMap = new Map<string, TableColumn>();
      for (const c of tgtCols) tgtColMap.set(c.name.toLowerCase(), c);

      // Check missing columns in target or type mismatches
      for (const [colNameLower, srcCol] of srcColMap.entries()) {
        const tgtCol = tgtColMap.get(colNameLower);
        const srcType = getColType(srcCol);
        const srcNullable = getColNullable(srcCol);

        if (!tgtCol) {
          colDiffs.push({
            name: srcCol.name,
            sourceType: srcType,
            sourceNullable: srcNullable,
            kind: "missing_in_target",
          });
          let addSql = `ALTER TABLE ${quote}${actualTableName}${quote} ADD COLUMN ${quote}${srcCol.name}${quote} ${srcType}`;
          if (!srcNullable && srcCol.default_value) {
            addSql += ` NOT NULL DEFAULT ${srcCol.default_value}`;
          }
          migrationStatements.push(`${addSql};`);
        } else {
          // Check type mismatch
          const tgtType = getColType(tgtCol);
          if (normalizeType(srcType) !== normalizeType(tgtType)) {
            colDiffs.push({
              name: srcCol.name,
              sourceType: srcType,
              targetType: tgtType,
              kind: "type_mismatch",
            });
            if (dialect === "mysql") {
              migrationStatements.push(`ALTER TABLE ${quote}${actualTableName}${quote} MODIFY COLUMN ${quote}${srcCol.name}${quote} ${srcType};`);
            } else {
              migrationStatements.push(`ALTER TABLE ${quote}${actualTableName}${quote} ALTER COLUMN ${quote}${srcCol.name}${quote} TYPE ${srcType};`);
            }
          }
        }
      }

      // Check extra columns in target
      for (const [colNameLower, tgtCol] of tgtColMap.entries()) {
        if (!srcColMap.has(colNameLower)) {
          colDiffs.push({
            name: tgtCol.name,
            targetType: getColType(tgtCol),
            targetNullable: getColNullable(tgtCol),
            kind: "extra_in_target",
          });
        }
      }

      if (colDiffs.length > 0) {
        differentCount++;
        tableDiffs.push({
          tableName: actualTableName,
          status: "different",
          columnDiffs: colDiffs,
          sourceColumns: srcCols,
          targetColumns: tgtCols,
        });
      } else {
        identicalCount++;
        tableDiffs.push({
          tableName: actualTableName,
          status: "identical",
          columnDiffs: [],
          sourceColumns: srcCols,
          targetColumns: tgtCols,
        });
      }
    }
  }

  const migrationSql = migrationStatements.length > 0
    ? `-- Auto-generated Schema Synchronization Script\n-- Generated on: ${new Date().toISOString()}\n\n` + migrationStatements.join("\n\n")
    : "-- Schemas are identical. No migration needed.";

  return {
    tables: tableDiffs,
    summary: {
      totalSourceTables: sourceTables.length,
      totalTargetTables: targetTables.length,
      sourceOnlyCount,
      targetOnlyCount,
      differentCount,
      identicalCount,
    },
    migrationSql,
  };
}
