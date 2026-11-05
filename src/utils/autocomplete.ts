import type { Monaco } from "@monaco-editor/react";
import { translate } from "../i18n/translate";
import type { editor as MonacoEditorNs, Position as MonacoPosition } from "monaco-editor";
import { invoke } from "@tauri-apps/api/core";
import type { TableInfo } from "../contexts/DatabaseContext";
import { formatSqlIdentifier, getQuoteChar, quoteIdentifier } from "./identifiers";
import { getCurrentStatement, parseTablesFromQuery, extractAllTablesFromQuery, extractColumnReferences, type ParsedTableRef } from "./sqlAnalysis";

export type AutocompleteKeywordCase = "match" | "upper" | "lower";

// Decide whether a keyword completion should be upper or lower case.
export function resolveKeywordCase(
  mode: AutocompleteKeywordCase | undefined,
  typedPrefix: string,
): "upper" | "lower" {
  if (mode === "upper") return "upper";
  if (mode === "lower") return "lower";

  const letters = typedPrefix.replace(/[^A-Za-z]/g, "");
  if (letters.length === 0) return "upper";
  return letters === letters.toLowerCase() ? "lower" : "upper";
}

// Apply the keyword-case setting
export function applyKeywordCase(
  keyword: string,
  mode: AutocompleteKeywordCase | undefined,
  typedPrefix: string,
): string {
  return resolveKeywordCase(mode, typedPrefix) === "lower"
    ? keyword.toLowerCase()
    : keyword.toUpperCase();
}

/**
 * In "match" mode the case is decided by the first typed letters. When the
 * list is opened with none yet (a trigger character such as " ", or Ctrl+Space
 * on an empty word), Monaco would only re-filter the items it already has as
 * the user types, keeping the fallback case. Marking that result incomplete
 * makes Monaco ask the provider again once there is a letter to match.
 */
export function needsKeywordCaseRetrigger(
  mode: AutocompleteKeywordCase | undefined,
  typedPrefix: string,
): boolean {
  return (mode ?? "match") === "match" && !/[A-Za-z]/.test(typedPrefix);
}

// Lightweight column cache with TTL and size limits
interface CachedColumns {
  data: Array<{ label: string; detail: string }>;
  timestamp: number;
  ttl: number;
}

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const NEGATIVE_CACHE_TTL = 30 * 1000; // 30 s for empty results (structurally empty table/view)
const MAX_CACHE_ENTRIES = 50; // Limit total cached tables
const columnsCache = new Map<string, CachedColumns>();

// Pre-built keyword suggestions (reused, not recreated each time)
const SQL_KEYWORDS = [
  "SELECT", "FROM", "WHERE", "GROUP BY", "ORDER BY", "LIMIT", "OFFSET",
  "INSERT", "INTO", "VALUES", "UPDATE", "SET", "DELETE", "JOIN", "LEFT JOIN",
  "RIGHT JOIN", "INNER JOIN", "OUTER JOIN", "ON", "AND", "OR", "NOT", "NULL",
  "IS", "IN", "BETWEEN", "LIKE", "AS", "DISTINCT", "COUNT", "SUM", "AVG",
  "MIN", "MAX", "HAVING", "CASE", "WHEN", "THEN", "ELSE", "END", "CREATE",
  "TABLE", "DROP", "ALTER", "INDEX", "PRIMARY KEY", "FOREIGN KEY", "REFERENCES"
] as const;

// Decide which identifier kind fits the cursor's SQL clause, so the completion
// list leads with the right category: columns right after SELECT/WHERE/ON/…,
// tables right after FROM/JOIN/…. Returns "any" at statement start / unknown.
// Based on the *last* clause keyword before the cursor, so it follows clause
// transitions (e.g. "... FROM t WHERE " flips back to column context).
export function detectSqlClauseContext(
  textUntilPosition: string,
): "table" | "column" | "any" {
  // Drop the partial word currently being typed, then scan the preceding text.
  const upper = textUntilPosition.replace(/[\w$]*$/, "").toUpperCase();

  const lastKeywordIndex = (kw: string): number => {
    const re = new RegExp(`\\b${kw.replace(/ /g, "\\s+")}\\b`, "g");
    let idx = -1;
    let m: RegExpExecArray | null;
    while ((m = re.exec(upper)) !== null) idx = m.index;
    return idx;
  };

  const lastOf = (kws: string[]): number =>
    kws.reduce((acc, kw) => Math.max(acc, lastKeywordIndex(kw)), -1);

  const tablePos = lastOf(["FROM", "JOIN", "INTO", "UPDATE", "TABLE"]);
  const columnPos = lastOf([
    "SELECT",
    "WHERE",
    "ON",
    "HAVING",
    "SET",
    "GROUP BY",
    "ORDER BY",
    "AND",
    "OR",
  ]);

  if (tablePos < 0 && columnPos < 0) return "any";
  return tablePos > columnPos ? "table" : "column";
}

// Cache cleanup to prevent unbounded growth
const cleanupCache = () => {
  if (columnsCache.size <= MAX_CACHE_ENTRIES) return;
  
  const now = Date.now();
  const entries = Array.from(columnsCache.entries());
  
  // Remove expired entries first
  for (const [key, value] of entries) {
    if (now - value.timestamp > CACHE_TTL) {
      columnsCache.delete(key);
    }
  }
  
  // If still over limit, remove oldest entries
  if (columnsCache.size > MAX_CACHE_ENTRIES) {
    const sorted = entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
    const toRemove = sorted.slice(0, columnsCache.size - MAX_CACHE_ENTRIES);
    toRemove.forEach(([key]) => columnsCache.delete(key));
  }
};

export function getCachedTableColumns(
  connectionId: string,
  tableName: string,
  schema?: string | null,
): Array<{ label: string; detail: string }> | null {
  if (!connectionId || !tableName) return null;
  const cacheKey = schema ? `${connectionId}:${schema}:${tableName}` : `${connectionId}:${tableName}`;
  const cached = columnsCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp) < cached.ttl) {
    return cached.data;
  }
  return null;
}

export const getTableColumns = async (connectionId: string, tableName: string, schema?: string | null) => {
  if (!connectionId || !tableName) return [];

  const cacheKey = schema ? `${connectionId}:${schema}:${tableName}` : `${connectionId}:${tableName}`;
  const cached = columnsCache.get(cacheKey);

  // Return cached data if valid
  if (cached && (Date.now() - cached.timestamp) < cached.ttl) {
    return cached.data;
  }

  try {
    const cols = await invoke<Array<{ name: string; data_type: string }>>("get_columns", {
      connectionId,
      tableName,
      ...(schema ? { schema } : {}),
    });

    if (!Array.isArray(cols)) {
      console.warn(`get_columns returned non-array for table ${tableName}`, cols);
      return [];
    }

    // Store only essential data (no kind, insertText duplicates)
    const simpleCols = cols.map(c => ({
      label: c.name,
      detail: c.data_type,
    }));

    // Cache with a short TTL for empty results (structurally empty table/view) so we
    // don't re-issue get_columns on every trigger. Errors are not cached — they remain
    // transient and will retry on the next trigger.
    columnsCache.set(cacheKey, {
      data: simpleCols,
      timestamp: Date.now(),
      ttl: simpleCols.length > 0 ? CACHE_TTL : NEGATIVE_CACHE_TTL,
    });
    cleanupCache();
    return simpleCols;
  } catch (e) {
    console.error(`Failed to fetch columns for autocomplete: ${tableName}`, e);
    return [];
  }
};

// Clear cache for a specific connection (call on disconnect)
export const clearAutocompleteCache = (connectionId?: string) => {
  if (connectionId) {
    const keysToDelete = Array.from(columnsCache.keys())
      .filter(key => key.startsWith(`${connectionId}:`));
    keysToDelete.forEach(key => columnsCache.delete(key));
  } else {
    columnsCache.clear();
  }
};

let sqlCompletionProvider: { dispose: () => void } | null = null;

export const disposeSqlAutocomplete = (): void => {
  sqlCompletionProvider?.dispose();
  sqlCompletionProvider = null;
};

export const registerSqlAutocomplete = (
  monaco: Monaco,
  connectionId: string | null,
  tables: TableInfo[],
  schema?: string | null,
  driver?: string | null,
  keywordCase: AutocompleteKeywordCase = "upper",
) => {
  const provider = monaco.languages.registerCompletionItemProvider("sql", {
    triggerCharacters: [".", " "],
    provideCompletionItems: async (model: { getWordUntilPosition: (position: { lineNumber: number; column: number }) => { word?: string; startColumn: number; endColumn: number }; getValueInRange: (range: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number }) => string; getValue: () => string; getOffsetAt: (position: { lineNumber: number; column: number }) => number }, position: { lineNumber: number; column: number }) => {
      if (!connectionId) return { suggestions: [] };

      const wordUntil = model.getWordUntilPosition(position);
      const typedPrefix = wordUntil.word ?? "";

      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: wordUntil.startColumn,
        endColumn: wordUntil.endColumn,
      };

      // When the user has already typed an opening quote, Monaco auto-closes it
      // so the cursor sits inside a pair (`"|"`); the user may also have deleted
      // the closing one (`"|`). Inserting a freshly quoted identifier into the
      // word range would then double the opening quote (`""AccountEventLog"`) or
      // leave it dangling. So when an opening quote precedes the replacement
      // range, expand the range to swallow it (and the closing quote if present)
      // and emit a fully-quoted identifier — yielding a canonical result for 0, 1
      // or 2 surrounding quotes alike.
      const quoteChar = getQuoteChar(driver);
      const charAt = (column: number): string =>
        column < 1
          ? ""
          : model.getValueInRange({
              startLineNumber: position.lineNumber,
              startColumn: column,
              endLineNumber: position.lineNumber,
              endColumn: column + 1,
            });
      const buildIdentifierInsert = (
        name: string,
        baseRange: { startLineNumber: number; endLineNumber: number; startColumn: number; endColumn: number },
      ): {
        insertText: string;
        range: { startLineNumber: number; endLineNumber: number; startColumn: number; endColumn: number };
        filterText?: string;
      } => {
        if (baseRange.startColumn <= 1 || charAt(baseRange.startColumn - 1) !== quoteChar) {
          return { insertText: formatSqlIdentifier(name, driver), range: baseRange };
        }
        const swallowsClosing = charAt(baseRange.endColumn) === quoteChar;
        const insertText = quoteIdentifier(name, driver);
        return {
          insertText,
          // The range now starts at the opening quote, so Monaco filters items
          // against the leading quote; match it by giving filterText the same
          // quoted form, otherwise every suggestion gets filtered out.
          filterText: insertText,
          range: {
            ...baseRange,
            startColumn: baseRange.startColumn - 1,
            endColumn: swallowsClosing ? baseRange.endColumn + 1 : baseRange.endColumn,
          },
        };
      };

      // Get text until cursor position
      const textUntilPosition = model.getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      });

      // Get current statement context
      const currentStatement = getCurrentStatement(model, position);
      const tableAliases = parseTablesFromQuery(currentStatement);


      // ============================================
      // 1. DOT TRIGGER (table.column, alias.column, or db.table.column)
      // ============================================
      // Try qualified (db.table.) first, then simple (table.)
      const qualifiedDotMatch = textUntilPosition.match(/`?([a-zA-Z0-9_]+)`?\.`?([a-zA-Z0-9_]+)`?\.([a-zA-Z0-9_]*)$/);
      const simpleDotMatch = qualifiedDotMatch ? null : textUntilPosition.match(/(?:["'`])?([a-zA-Z0-9_]+)(?:["'`])?\.([a-zA-Z0-9_]*)$/);

      if (qualifiedDotMatch || simpleDotMatch) {
        let dotTables: TableInfo[] = [];
        let partialColumn: string;

        if (qualifiedDotMatch) {
          const dbName = qualifiedDotMatch[1].toLowerCase();
          const tblName = qualifiedDotMatch[2].toLowerCase();
          partialColumn = qualifiedDotMatch[3];
          const found = tables.find(t => t.name.toLowerCase() === tblName && t.schema?.toLowerCase() === dbName);
          dotTables = found ? [found] : [{ name: tblName, schema: dbName }];
        } else {
          const typedName = simpleDotMatch![1].toLowerCase();
          partialColumn = simpleDotMatch![2];
          // Resolve via alias map (carries schema when FROM used qualified ref)
          const aliasRef: ParsedTableRef | undefined = tableAliases?.get(typedName);
          if (aliasRef) {
            const found = tables.find(t =>
              t.name.toLowerCase() === aliasRef.name.toLowerCase() &&
              (!aliasRef.schema || t.schema?.toLowerCase() === aliasRef.schema.toLowerCase())
            );
            dotTables = found ? [found] : [{ name: aliasRef.name, schema: aliasRef.schema }];
          } else {
            // Unqualified: collect every loaded table with this name across all schemas
            const matches = tables.filter(t => t.name.toLowerCase() === typedName);
            dotTables = matches.length > 0 ? matches : [{ name: typedName }];
          }
        }

        const colArrays = await Promise.all(
          dotTables.map(t => getTableColumns(connectionId, t.name, t.schema ?? schema))
        );
        const seen = new Set<string>();
        const columns = colArrays.flat().filter(c => (seen.has(c.label) ? false : (seen.add(c.label), true)));

        if (columns.length > 0) {
          const columnRange = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: position.column - partialColumn.length,
            endColumn: position.column,
          };
          return {
            // Keep the table's own column order (id, name, …) instead of
            // sorting alphabetically, so the list matches the table/result view.
            suggestions: columns.map((c, i) => ({
              label: c.label,
              kind: monaco.languages.CompletionItemKind.Field,
              detail: c.detail,
              ...buildIdentifierInsert(c.label, columnRange),
              sortText: `0_${String(i).padStart(4, "0")}`,
            })),
          };
        }

        return { suggestions: [] };
      }

      // ============================================
      // 2. CONTEXT-AWARE COLUMN SUGGESTIONS
      // ============================================
      const contextColumnSuggestions: Array<{
        label: string;
        kind: number;
        detail: string;
        insertText: string;
        range: { startLineNumber: number; endLineNumber: number; startColumn: number; endColumn: number };
        sortText: string;
        filterText?: string;
        documentation?: { value: string };
      }> = [];
      
      if (tableAliases && tableAliases.size > 0) {
        // Deduplicate parsed refs by (schema, name) — multiple aliases can point to the same table
        const seenRefs = new Set<string>();
        const uniqueRefs = Array.from(tableAliases.values()).filter(ref => {
          const key = `${ref.schema ?? ''}:${ref.name}`;
          return seenRefs.has(key) ? false : (seenRefs.add(key), true);
        });

        // For qualified refs (schema known) find the exact table; for unqualified refs
        // expand to ALL loaded tables with that name so every selected DB is covered.
        const matchingTables: TableInfo[] = uniqueRefs.flatMap(ref => {
          if (ref.schema) {
            const found = tables.find(t =>
              t.name.toLowerCase() === ref.name.toLowerCase() &&
              t.schema?.toLowerCase() === ref.schema!.toLowerCase()
            );
            return found ? [found] : [ref as TableInfo];
          }
          const found = tables.filter(t => t.name.toLowerCase() === ref.name.toLowerCase());
          return found.length > 0 ? found : [ref as TableInfo];
        });

        // Limit parallel fetches to prevent memory spikes
        const MAX_PARALLEL_FETCHES = 5;
        if (matchingTables.length > MAX_PARALLEL_FETCHES) {
          matchingTables.splice(MAX_PARALLEL_FETCHES);
        }

        const results = await Promise.all(
          matchingTables.map(t => getTableColumns(connectionId, t.name, t.schema ?? schema))
        );

        const seenColumns = new Set<string>();

        matchingTables.forEach((table, idx) => {
          const columns = results[idx];
          columns.forEach(col => {
            if (!seenColumns.has(col.label)) {
              seenColumns.add(col.label);

              // Find alias for this table (if any)
              let aliasHint = "";
              for (const [alias, ref] of tableAliases.entries()) {
                if (ref.name.toLowerCase() === table.name.toLowerCase() && alias !== table.name.toLowerCase()) {
                  aliasHint = ` (${alias})`;
                  break;
                }
              }

              contextColumnSuggestions.push({
                label: col.label,
                kind: monaco.languages.CompletionItemKind.Field,
                detail: `${col.detail} — ${table.name}${aliasHint}`,
                documentation: {
                  value: `**Column**: \`${col.label}\`\n\n**Type**: \`${col.detail}\`\n\n**Table**: \`${table.name}\``,
                },
                ...buildIdentifierInsert(col.label, range),
                // Preserve the table's column order (push order) rather than
                // sorting alphabetically, so the list mirrors the table view.
                sortText: `0_${String(contextColumnSuggestions.length).padStart(4, "0")}`,
              });
            }
          });
        });
      } else if (tables && tables.length > 0 && detectSqlClauseContext(textUntilPosition) === "column") {
        // Fallback: when user has typed "SELECT " and hasn't written "FROM" yet,
        // provide columns from the available tables in the database (sample up to 5 tables)
        const sampleTables = tables.slice(0, 5);
        const results = await Promise.all(
          sampleTables.map(t => getTableColumns(connectionId, t.name, t.schema ?? schema))
        );
        const seenColumns = new Set<string>();
        sampleTables.forEach((table, idx) => {
          const cols = results[idx] || [];
          cols.forEach(col => {
            const key = `${table.name}.${col.label}`;
            if (!seenColumns.has(key)) {
              seenColumns.add(key);
              contextColumnSuggestions.push({
                label: col.label,
                kind: monaco.languages.CompletionItemKind.Field,
                detail: `${col.detail} — ${table.name}`,
                documentation: {
                  value: `**Column**: \`${col.label}\`\n\n**Type**: \`${col.detail}\`\n\n**Table**: \`${table.name}\``,
                },
                ...buildIdentifierInsert(col.label, range),
                sortText: `0_${String(contextColumnSuggestions.length).padStart(4, "0")}`,
              });
            }
          });
        });
      }

      // ============================================
      // 3. KEYWORD SUGGESTIONS
      // ============================================
      const colLabels = new Set(contextColumnSuggestions.map(s => s.label.toUpperCase()));
      const keywordSuggestions = SQL_KEYWORDS
        .filter(kw => !colLabels.has(kw))
        .map((kw) => {
          const text = applyKeywordCase(kw, keywordCase, typedPrefix);
          return {
            label: text,
            kind: monaco.languages.CompletionItemKind.Keyword,
            insertText: text,
            range,
            sortText: `2_${kw}`,
          };
        });

      // ============================================
      // 4. TABLE SUGGESTIONS
      // ============================================
      const tableSuggestions = tables.map((t) => ({
        label: t.name,
        kind: monaco.languages.CompletionItemKind.Class,
        detail: t.schema ? `Table (${t.schema})` : "Table",
        documentation: {
          value: `### 📁 Table: \`${t.name}\`${t.schema ? `\n*Database/Schema*: \`${t.schema}\`` : ''}\n\n*${translate("autocomplete.pressEnterTable")}*`,
        },
        ...buildIdentifierInsert(t.name, range),
        sortText: `1_${t.name}`,
      }));

      // ============================================
      // 5. ORDER BY CLAUSE CONTEXT
      // ============================================
      // In a column position (right after SELECT / WHERE / ON / GROUP BY / …)
      // the full table list is just noise — lead with columns, then keywords,
      // and push tables to the bottom. This is what fixes "typing after SELECT
      // suggests tables instead of columns". `sortText` controls the order;
      // nothing is dropped, so a table name is still reachable if actually typed.
      // FROM / JOIN and statement-start contexts keep the original ordering.
      if (detectSqlClauseContext(textUntilPosition) === "column") {
        return {
          suggestions: [
            ...contextColumnSuggestions, // sortText already "0_…"
            ...keywordSuggestions.map((s) => ({ ...s, sortText: `1_${s.label}` })),
            ...tableSuggestions.map((s) => ({ ...s, sortText: `3_${s.label}` })),
          ],
          ...(keywordSuggestions.length > 0 &&
          needsKeywordCaseRetrigger(keywordCase, typedPrefix)
            ? { incomplete: true }
            : {}),
        };
      }

      if (detectSqlClauseContext(textUntilPosition) === "table") {
        return {
          suggestions: [
            ...tableSuggestions, // sortText 1_...
            ...keywordSuggestions.map((s) => ({ ...s, sortText: `2_${s.label}` })),
            ...contextColumnSuggestions.map((s) => ({ ...s, sortText: `3_${s.label}` })),
          ],
          ...(keywordSuggestions.length > 0 &&
          needsKeywordCaseRetrigger(keywordCase, typedPrefix)
            ? { incomplete: true }
            : {}),
        };
      }

      return {
        suggestions: [
          ...contextColumnSuggestions,
          ...tableSuggestions,
          ...keywordSuggestions,
        ],
        ...(keywordSuggestions.length > 0 &&
        needsKeywordCaseRetrigger(keywordCase, typedPrefix)
          ? { incomplete: true }
          : {}),
      };
    },
  });

  sqlCompletionProvider?.dispose();
  sqlCompletionProvider = provider;
  return provider;
};

let sqlHoverProvider: { dispose: () => void } | null = null;

export const disposeSqlHover = (): void => {
  sqlHoverProvider?.dispose();
  sqlHoverProvider = null;
};

/**
 * Register hover provider to display table schemas & column types when hovering over SQL code.
 */
export const registerSqlHover = (
  monaco: Monaco,
  connectionId: string | null,
  tables: TableInfo[],
  schema?: string | null,
) => {
  sqlHoverProvider?.dispose();
  if (!connectionId || !tables.length) return null;

  const provider = monaco.languages.registerHoverProvider("sql", {
    provideHover: async (model: MonacoEditorNs.ITextModel, position: MonacoPosition) => {
      const word = model.getWordAtPosition(position);
      if (!word) return null;

      const wordText = word.word.toLowerCase();

      // Check if word matches a table name
      const matchedTable = tables.find(t => t.name.toLowerCase() === wordText);
      if (matchedTable) {
        const columns = await getTableColumns(connectionId, matchedTable.name, matchedTable.schema ?? schema);
        const colList = columns.length > 0
          ? columns.map(c => `- \`${c.label}\`: *${c.detail}*`).join("\n")
          : `_${translate("autocomplete.noColumns")}_`;

        return {
          range: {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endColumn: word.endColumn,
          },
          contents: [
            { value: `### 📁 **Table**: \`${matchedTable.name}\`${matchedTable.schema ? ` (Schema: \`${matchedTable.schema}\`)` : ""}` },
            { value: `**${translate("autocomplete.columnList", { count: columns.length })}**\n${colList}` },
          ],
        };
      }

      // Check if word matches a column in cached tables
      const matchedCols: Array<{ table: string; type: string }> = [];
      for (const [key, cache] of columnsCache.entries()) {
        const col = cache.data.find(c => c.label.toLowerCase() === wordText);
        if (col) {
          const parts = key.split(":");
          const tableName = parts[parts.length - 1];
          matchedCols.push({ table: tableName, type: col.detail });
        }
      }

      if (matchedCols.length > 0) {
        const info = matchedCols.map(m => translate("autocomplete.tableEntry", { table: m.table, type: m.type })).join("\n");
        return {
          range: {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endColumn: word.endColumn,
          },
          contents: [
            { value: `### 🔹 **Column**: \`${word.word}\`` },
            { value: `**${translate("autocomplete.belongsTo")}**\n${info}` },
          ],
        };
      }

      return null;
    },
  });

  sqlHoverProvider = provider;
  return provider;
};

export interface SqlValidationOptions {
  connectionId?: string | null;
  schema?: string | null;
  owner?: string;
  columnProvider?: (tableName: string, schema?: string | null) => Promise<Array<{ label: string; detail: string }>>;
}

/**
 * Validates table and column names referenced in SQL against the loaded schema.
 * Displays clear, highlighted warning/error markers in Monaco if a table or column does not exist.
 */
export function validateSqlSchema(
  monaco: Monaco,
  model: {
    getValue: () => string;
    getPositionAt: (offset: number) => { lineNumber: number; column: number };
    getOffsetAt: (position: { lineNumber: number; column: number }) => number;
  },
  tables: TableInfo[],
  optionsOrOwner?: string | SqlValidationOptions,
): void {
  if (!model) return;
  const editorModel = model as Parameters<typeof monaco.editor.setModelMarkers>[0];

  const options: SqlValidationOptions =
    typeof optionsOrOwner === "string" ? { owner: optionsOrOwner } : optionsOrOwner || {};
  const owner = options.owner || "tabularis-sql-lint";
  const connectionId = options.connectionId;
  const schema = options.schema;

  if (!tables || tables.length === 0) {
    monaco.editor.setModelMarkers(editorModel, owner, []);
    return;
  }

  const text = model.getValue();
  if (!text || !text.trim()) {
    monaco.editor.setModelMarkers(editorModel, owner, []);
    return;
  }

  const extractedScope = typeof extractAllTablesFromQuery === "function"
    ? extractAllTablesFromQuery(text)
    : null;

  const tableMap = (extractedScope && extractedScope.tables.size > 0)
    ? extractedScope.tables
    : (parseTablesFromQuery(text) || new Map<string, ParsedTableRef>());

  if (!tableMap || tableMap.size === 0) {
    monaco.editor.setModelMarkers(editorModel, owner, []);
    return;
  }

  const cteNames = extractedScope ? extractedScope.cteNames : new Set<string>();
  const tablePositions = (extractedScope && extractedScope.tablePositions.length > 0)
    ? extractedScope.tablePositions
    : Array.from(tableMap.entries()).map(([alias, ref]) => {
        const idx = text.toLowerCase().indexOf(ref.name.toLowerCase());
        return {
          name: ref.name,
          schema: ref.schema,
          alias,
          startIndex: Math.max(0, idx),
          endIndex: Math.max(0, idx) + ref.name.length,
        };
      });

  const knownTableMap = new Map<string, TableInfo>();
  for (const t of tables) {
    knownTableMap.set(t.name.toLowerCase(), t);
  }

  const markers: Array<{
    severity: number;
    message: string;
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
  }> = [];

  const markerSeverity = monaco.MarkerSeverity?.Error ?? 8;

  // 1. Table Validation
  const checkedTableNames = new Set<string>();
  for (const occ of tablePositions) {
    const nameLower = occ.name.toLowerCase();
    if (cteNames.has(nameLower) || checkedTableNames.has(nameLower)) {
      continue;
    }
    checkedTableNames.add(nameLower);

    const exists = knownTableMap.has(nameLower);
    if (!exists) {
      const startPos = model.getPositionAt(occ.startIndex);
      const endPos = model.getPositionAt(occ.endIndex);
      markers.push({
        severity: markerSeverity,
        message: translate("autocomplete.tableMissing", { name: occ.name }),
        startLineNumber: startPos.lineNumber,
        startColumn: startPos.column,
        endLineNumber: endPos.lineNumber,
        endColumn: endPos.column,
      });
    }
  }

  // 2. Column Validation
  if (connectionId && tablePositions.length > 0) {
    // Only validate columns for tables that exist in the database
    const validTablesInQuery = tablePositions
      .map(p => knownTableMap.get(p.name.toLowerCase()))
      .filter((t): t is TableInfo => Boolean(t));

    if (validTablesInQuery.length > 0) {
      const tableColumnsMap = new Map<string, Set<string>>();
      const missingTablesToFetch: TableInfo[] = [];

      for (const t of validTablesInQuery) {
        const cached = getCachedTableColumns(connectionId, t.name, t.schema ?? schema);
        if (cached) {
          tableColumnsMap.set(t.name.toLowerCase(), new Set(cached.map(c => c.label.toLowerCase())));
        } else {
          missingTablesToFetch.push(t);
        }
      }

      const applyColumnValidation = () => {
        if (typeof extractColumnReferences !== "function") return;
        const colRefs = extractColumnReferences(text, tableMap, cteNames);
        const colMarkers: typeof markers = [];

        for (const colRef of colRefs) {
          const colNameLower = colRef.name.toLowerCase();

          if (colRef.tableOrAlias) {
            // Qualified: qualifier.column
            const qualifierLower = colRef.tableOrAlias.toLowerCase();
            const targetTableRef = tableMap.get(qualifierLower);
            const targetTableName = targetTableRef ? targetTableRef.name.toLowerCase() : qualifierLower;

            const colsSet = tableColumnsMap.get(targetTableName);
            if (colsSet && !colsSet.has(colNameLower)) {
              const startPos = model.getPositionAt(colRef.startIndex);
              const endPos = model.getPositionAt(colRef.endIndex);
              colMarkers.push({
                severity: markerSeverity,
                message: translate("autocomplete.columnMissingInTable", { column: colRef.name, table: targetTableRef?.name || colRef.tableOrAlias }),
                startLineNumber: startPos.lineNumber,
                startColumn: startPos.column,
                endLineNumber: endPos.lineNumber,
                endColumn: endPos.column,
              });
            }
          } else {
            // Unqualified column in single or multi-table query
            if (validTablesInQuery.length === 1) {
              const singleTableName = validTablesInQuery[0].name.toLowerCase();
              const colsSet = tableColumnsMap.get(singleTableName);
              if (colsSet && !colsSet.has(colNameLower)) {
                const startPos = model.getPositionAt(colRef.startIndex);
                const endPos = model.getPositionAt(colRef.endIndex);
                colMarkers.push({
                  severity: markerSeverity,
                  message: translate("autocomplete.columnMissingInTable", { column: colRef.name, table: validTablesInQuery[0].name }),
                  startLineNumber: startPos.lineNumber,
                  startColumn: startPos.column,
                  endLineNumber: endPos.lineNumber,
                  endColumn: endPos.column,
                });
              }
            } else if (validTablesInQuery.length > 1) {
              // In multi-table query: check if exists in ANY of the loaded tables
              const allColsLoaded = validTablesInQuery.every(t => tableColumnsMap.has(t.name.toLowerCase()));
              if (allColsLoaded) {
                const existsInAny = validTablesInQuery.some(t =>
                  tableColumnsMap.get(t.name.toLowerCase())?.has(colNameLower)
                );
                if (!existsInAny) {
                  const startPos = model.getPositionAt(colRef.startIndex);
                  const endPos = model.getPositionAt(colRef.endIndex);
                  const tableNamesList = validTablesInQuery.map(t => t.name).join(", ");
                  colMarkers.push({
                    severity: markerSeverity,
                    message: translate("autocomplete.columnMissingInTables", { column: colRef.name, tables: tableNamesList }),
                    startLineNumber: startPos.lineNumber,
                    startColumn: startPos.column,
                    endLineNumber: endPos.lineNumber,
                    endColumn: endPos.column,
                  });
                }
              }
            }
          }
        }

        monaco.editor.setModelMarkers(editorModel, owner, [...markers, ...colMarkers]);
      };

      // If any tables need columns fetched, trigger in background
      if (missingTablesToFetch.length > 0) {
        Promise.all(
          missingTablesToFetch.map(async t => {
            const cols = await getTableColumns(connectionId, t.name, t.schema ?? schema);
            return { name: t.name.toLowerCase(), cols: new Set(cols.map(c => c.label.toLowerCase())) };
          })
        ).then(fetched => {
          for (const item of fetched) {
            tableColumnsMap.set(item.name, item.cols);
          }
          if (model.getValue() === text) {
            applyColumnValidation();
          }
        }).catch(err => {
          console.warn("Failed to fetch columns for validation:", err);
        });
      }

      applyColumnValidation();
      return;
    }
  }

  monaco.editor.setModelMarkers(editorModel, owner, markers);
}
