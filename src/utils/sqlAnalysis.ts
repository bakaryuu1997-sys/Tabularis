// SQL Analysis Utilities - Pure logic functions for parsing and analyzing SQL

import { leadingKeyword } from './sqlSplitter/classify';

export interface ParsedTableRef {
  name: string;
  schema?: string;
}

// Removes wrapping SQL identifier quotes/backticks.
// Unquoted identifiers are normalized to lowercase.
export function stripIdentifierQuotes(token: string): string {
  const q = token[0];
  if (q === '"' || q === '`' || q === '[') {
    const endChar = q === '[' ? ']' : q;
    const inner = token.endsWith(endChar) ? token.slice(1, -1) : token.slice(1);
    return inner.replaceAll(q + q, q);
  }
  return token.toLowerCase();
}

/**
 * Masks comments and string literals with whitespace of identical character length,
 * ensuring character offsets match 1-to-1 with the original SQL string for diagnostics.
 */
export function maskCommentsAndLiterals(sql: string): string {
  if (!sql) return '';
  // 1. Single-line comments -- ...
  let res = sql.replace(/--[^\r\n]*/g, (m) => ' '.repeat(m.length));
  // 2. Block comments /* ... */
  res = res.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\r\n]/g, ' '));
  // 3. PostgreSQL dollar-quoted strings: $tag$...$tag$ or $$...$$
  res = res.replace(/\$([a-zA-Z0-9_]*)\$[\s\S]*?\$\1\$/g, (m) => m.replace(/[^\r\n]/g, ' '));
  // 4. Standard string literals: '...'
  res = res.replace(/'(?:[^'\\]|\\.|'')*'/g, (m) => "'" + ' '.repeat(Math.max(0, m.length - 2)) + "'");
  return res;
}

export interface TableOccurrence {
  name: string;
  schema?: string;
  alias?: string;
  startIndex: number;
  endIndex: number;
}

export interface ExtractedSqlScope {
  tables: Map<string, ParsedTableRef>; // alias/name -> ParsedTableRef
  cteNames: Set<string>;
  tablePositions: TableOccurrence[];
}

export interface ExtractedColumnRef {
  name: string;
  tableOrAlias?: string; // If qualified (e.g. u.id or users.id)
  startIndex: number;
  endIndex: number;
}

export const STANDARD_SQL_KEYWORDS = new Set([
  // Clauses & Keywords
  'select', 'from', 'where', 'and', 'or', 'not', 'in', 'is', 'null', 'like', 'ilike',
  'between', 'exists', 'case', 'when', 'then', 'else', 'end', 'as', 'distinct', 'all',
  'any', 'some', 'join', 'left', 'right', 'inner', 'outer', 'cross', 'full', 'natural',
  'on', 'using', 'group', 'by', 'having', 'order', 'asc', 'desc', 'nulls', 'first', 'last',
  'limit', 'offset', 'fetch', 'union', 'intersect', 'except', 'insert', 'into', 'values',
  'update', 'set', 'delete', 'truncate', 'table', 'create', 'alter', 'drop', 'view',
  'index', 'database', 'schema', 'default', 'primary', 'key', 'foreign', 'references',
  'constraint', 'cascade', 'restrict', 'check', 'unique', 'with', 'recursive',
  'true', 'false', 'boolean', 'collate', 'returning', 'conflict', 'do', 'nothing',
  'over', 'partition', 'window', 'rows', 'range', 'unbounded', 'preceding', 'following',
  'current', 'row', 'lateral', 'tablesample', 'qualify', 'straight_join', 'interval',
  'year', 'month', 'day', 'hour', 'minute', 'second', 'for', 'update', 'share',
  'session_user', 'user', 'system_user', 'current_date', 'current_time', 'current_timestamp',
  'current_user', 'localtime', 'localtimestamp', 'cast', 'extract', 'position', 'substring',
  'trim', 'leading', 'trailing', 'both', 'only',
  // Common Data Types
  'int', 'integer', 'bigint', 'smallint', 'tinyint', 'mediumint', 'numeric', 'decimal',
  'float', 'real', 'double', 'precision', 'money', 'character', 'varying', 'varchar',
  'char', 'text', 'binary', 'varbinary', 'blob', 'bytea', 'date', 'time', 'timestamp',
  'timestamptz', 'interval', 'uuid', 'json', 'jsonb', 'xml', 'serial', 'bigserial',
  // Pseudo-tables and system words
  'dual', 'information_schema', 'pg_catalog', 'sqlite_master', 'sqlite_schema', 'sys',
]);

const TABLE_BOUNDARY_KEYWORDS = new Set([
  'join', 'left', 'right', 'inner', 'outer', 'cross', 'natural', 'full',
  'on', 'using', 'where', 'group', 'order', 'having', 'limit', 'offset',
  'union', 'intersect', 'except', 'for', 'fetch', 'window', 'lateral',
  'tablesample', 'qualify', 'straight_join', 'set', 'values'
]);

/**
 * Extracts all table occurrences, aliases, and CTE declarations across SELECT, INSERT, UPDATE, DELETE queries.
 */
export function extractAllTablesFromQuery(sql: string): ExtractedSqlScope {
  const tableMap = new Map<string, ParsedTableRef>();
  const cteNames = new Set<string>();
  const tablePositions: TableOccurrence[] = [];

  if (!sql || !sql.trim()) {
    return { tables: tableMap, cteNames, tablePositions };
  }

  const masked = maskCommentsAndLiterals(sql);

  // 1. Detect CTE names (WITH [RECURSIVE] name [(...)] AS (...) [, name2 AS (...)])
  const ctePattern = /(?:\bwith\s+(?:recursive\s+)?|,\s*)([a-zA-Z_][a-zA-Z0-9_]*|"(?:[^"]|"")*"|`[^`]+`|\[[^\]]+\])\s*(?:\([^)]*\)\s*)?as\s*\(/gi;
  let cteMatch: RegExpExecArray | null;
  while ((cteMatch = ctePattern.exec(masked)) !== null) {
    const name = stripIdentifierQuotes(cteMatch[1]);
    if (!STANDARD_SQL_KEYWORDS.has(name.toLowerCase())) {
      cteNames.add(name.toLowerCase());
    }
  }

  // Helper to record a table occurrence
  const addTableOccurrence = (rawToken: string, schemaToken: string | undefined, aliasToken: string | undefined, fullMatchIndex: number, fullMatchStr: string) => {
    const rawName = stripIdentifierQuotes(rawToken);
    if (STANDARD_SQL_KEYWORDS.has(rawName.toLowerCase()) || cteNames.has(rawName.toLowerCase())) {
      return;
    }

    const schema = schemaToken ? stripIdentifierQuotes(schemaToken) : undefined;
    const cleanAlias = aliasToken ? stripIdentifierQuotes(aliasToken) : rawName;
    const alias = TABLE_BOUNDARY_KEYWORDS.has(cleanAlias.toLowerCase()) ? rawName : cleanAlias;

    const tableTokenIndex = fullMatchIndex + fullMatchStr.lastIndexOf(rawToken);

    if (!tablePositions.some((p) => p.startIndex === tableTokenIndex)) {
      tablePositions.push({
        name: rawName,
        schema,
        alias,
        startIndex: tableTokenIndex,
        endIndex: tableTokenIndex + rawToken.length,
      });
      tableMap.set(alias.toLowerCase(), { name: rawName, schema });
      tableMap.set(rawName.toLowerCase(), { name: rawName, schema });
    }
  };

  // 2. Extract tables in FROM / JOIN sections
  // Only search after FROM or JOIN keywords
  const fromJoinRegex = /\b(?:from|(?:left\s+|right\s+|inner\s+|outer\s+|cross\s+|natural\s+|full\s+)*join)\b/gi;
  let fjMatch: RegExpExecArray | null;

  while ((fjMatch = fromJoinRegex.exec(masked)) !== null) {
    const isFrom = fjMatch[0].toLowerCase() === 'from';
    const sectionStart = fjMatch.index + fjMatch[0].length;
    const rest = masked.slice(sectionStart);

    // If FROM, it can be followed by table1 [as a1], table2 [as a2] until boundary
    // If JOIN, it's followed by table1 [as a1] until ON / USING / boundary
    const boundaryMatch = /\b(?:where|group\s+by|order\s+by|having|limit|offset|union|intersect|except|for\s+update|join|left|right|inner|outer|cross|natural|full)\b/i.exec(rest);
    const sectionLength = boundaryMatch ? boundaryMatch.index : rest.length;
    const sectionText = rest.slice(0, sectionLength);

    // Strip ON <cond> and USING(...)
    const cleanedSection = sectionText
      .replace(/\bon\b[\s\S]*?(?=\bjoin\b|$)/gi, (m) => ' '.repeat(m.length))
      .replace(/\busing\s*\([^)]*\)/gi, (m) => ' '.repeat(m.length));

    // Match tables in this isolated section: first table or comma-separated tables
    const tablePattern = /(?:^|,)\s*("(?:[^"]|"")*"|`[^`]+`|\[[^\]]+\]|[a-zA-Z_][a-zA-Z0-9_]*)(?:\.("(?:[^"]|"")*"|`[^`]+`|\[[^\]]+\]|[a-zA-Z_][a-zA-Z0-9_]*))?(?:\s+(?:as\s+)?("(?:[^"]|"")*"|`[^`]+`|\[[^\]]+\]|[a-zA-Z_][a-zA-Z0-9_]*))?/gi;
    let tMatch: RegExpExecArray | null;

    while ((tMatch = tablePattern.exec(cleanedSection)) !== null) {
      const schemaToken = tMatch[2] ? tMatch[1] : undefined;
      const tableToken = tMatch[2] ?? tMatch[1];
      if (!tableToken) continue;

      const aliasToken = tMatch[3];
      addTableOccurrence(tableToken, schemaToken, aliasToken, sectionStart + tMatch.index, tMatch[0]);

      // If not FROM (i.e. single table in JOIN), break after first table
      if (!isFrom) break;
    }
  }

  // 3. Extract tables from INSERT INTO, UPDATE, DELETE FROM, TRUNCATE
  const dmlPattern =
    /\b(?:insert\s+into|update|delete\s+from|truncate\s+(?:table\s+)?)\s+("(?:[^"]|"")*"|`[^`]+`|\[[^\]]+\]|[a-zA-Z_][a-zA-Z0-9_]*)(?:\.("(?:[^"]|"")*"|`[^`]+`|\[[^\]]+\]|[a-zA-Z_][a-zA-Z0-9_]*))?/gi;

  let dmlMatch: RegExpExecArray | null;
  while ((dmlMatch = dmlPattern.exec(masked)) !== null) {
    const schemaToken = dmlMatch[2] ? dmlMatch[1] : undefined;
    const tableToken = dmlMatch[2] ?? dmlMatch[1];
    if (!tableToken) continue;

    addTableOccurrence(tableToken, schemaToken, undefined, dmlMatch.index, dmlMatch[0]);
  }

  return { tables: tableMap, cteNames, tablePositions };
}

/**
 * Extracts qualified and unqualified column references from SQL query text for schema validation.
 */
export function extractColumnReferences(
  sql: string,
  tableAliases: Map<string, ParsedTableRef>,
  cteNames: Set<string>,
): ExtractedColumnRef[] {
  const results: ExtractedColumnRef[] = [];
  if (!sql || !sql.trim()) return results;

  const masked = maskCommentsAndLiterals(sql);

  // 1. Qualified column references: qualifier.column (e.g. u.id, users.email)
  const qualifiedPattern =
    /(?<![a-zA-Z0-9_."`\]])([a-zA-Z_][a-zA-Z0-9_]*|"(?:[^"]|"")*"|`[^`]+`|\[[^\]]+\])\s*\.\s*([a-zA-Z_][a-zA-Z0-9_]*|"(?:[^"]|"")*"|`[^`]+`|\[[^\]]+\]|\*)(?![a-zA-Z0-9_."`\]])/g;

  let qMatch: RegExpExecArray | null;
  const coveredRanges: Array<[number, number]> = [];

  while ((qMatch = qualifiedPattern.exec(masked)) !== null) {
    const qualifierRaw = qMatch[1];
    const columnRaw = qMatch[2];

    const qualifier = stripIdentifierQuotes(qualifierRaw);
    const colName = stripIdentifierQuotes(columnRaw);

    // Skip wildcard *
    if (colName === '*') continue;

    const colIndex = qMatch.index + qMatch[0].lastIndexOf(columnRaw);
    coveredRanges.push([qMatch.index, qMatch.index + qMatch[0].length]);

    results.push({
      name: colName,
      tableOrAlias: qualifier,
      startIndex: colIndex,
      endIndex: colIndex + columnRaw.length,
    });
  }

  // 2. Unqualified columns in INSERT INTO table (col1, col2, ...)
  const insertPattern = /\binsert\s+into\s+([a-zA-Z0-9_."`\]]+)\s*\(\s*([^)]+)\s*\)/gi;
  let insMatch: RegExpExecArray | null;
  while ((insMatch = insertPattern.exec(masked)) !== null) {
    const rawTable = stripIdentifierQuotes(insMatch[1].split('.').pop()!);
    const colListStr = insMatch[2];
    const colListBase = insMatch.index + insMatch[0].indexOf(colListStr);

    const idPattern = /([a-zA-Z_][a-zA-Z0-9_]*|"(?:[^"]|"")*"|`[^`]+`|\[[^\]]+\])/g;
    let idM: RegExpExecArray | null;
    while ((idM = idPattern.exec(colListStr)) !== null) {
      const cName = stripIdentifierQuotes(idM[0]);
      if (!STANDARD_SQL_KEYWORDS.has(cName.toLowerCase())) {
        const start = colListBase + idM.index;
        coveredRanges.push([start, start + idM[0].length]);
        results.push({
          name: cName,
          tableOrAlias: rawTable,
          startIndex: start,
          endIndex: start + idM[0].length,
        });
      }
    }
  }

  // 3. Unqualified columns in UPDATE table SET col1 = ..., col2 = ...
  const updatePattern = /\bupdate\s+([a-zA-Z0-9_."`\]]+)\s+set\s+([^;]+?)(?:\bwhere\b|;|$)/gi;
  let updMatch: RegExpExecArray | null;
  while ((updMatch = updatePattern.exec(masked)) !== null) {
    const rawTable = stripIdentifierQuotes(updMatch[1].split('.').pop()!);
    const setListStr = updMatch[2];
    const setListBase = updMatch.index + updMatch[0].indexOf(setListStr);

    const assignPattern = /([a-zA-Z_][a-zA-Z0-9_]*|"(?:[^"]|"")*"|`[^`]+`|\[[^\]]+\])\s*=/g;
    let assignM: RegExpExecArray | null;
    while ((assignM = assignPattern.exec(setListStr)) !== null) {
      const cName = stripIdentifierQuotes(assignM[1]);
      if (!STANDARD_SQL_KEYWORDS.has(cName.toLowerCase())) {
        const start = setListBase + assignM.index;
        coveredRanges.push([start, start + assignM[1].length]);
        results.push({
          name: cName,
          tableOrAlias: rawTable,
          startIndex: start,
          endIndex: start + assignM[1].length,
        });
      }
    }
  }

  // 4. Collect aliases defined in SELECT (e.g. SELECT name AS full_name)
  const definedAliases = new Set<string>();
  const asPattern = /\bas\s+([a-zA-Z_][a-zA-Z0-9_]*|"(?:[^"]|"")*"|`[^`]+`|\[[^\]]+\])/gi;
  let asM: RegExpExecArray | null;
  while ((asM = asPattern.exec(masked)) !== null) {
    definedAliases.add(stripIdentifierQuotes(asM[1]).toLowerCase());
  }

  // 5. Unqualified identifiers in SELECT, WHERE, ON, GROUP BY, ORDER BY, HAVING
  const wordPattern = /\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g;
  let wordM: RegExpExecArray | null;
  while ((wordM = wordPattern.exec(masked)) !== null) {
    const word = wordM[1];
    const wordLower = word.toLowerCase();
    const startIndex = wordM.index;
    const endIndex = startIndex + word.length;

    // Check if covered by qualified reference or INSERT/UPDATE
    if (coveredRanges.some(([s, e]) => startIndex >= s && endIndex <= e)) {
      continue;
    }

    // Check if followed immediately by '(' -> function call like COUNT(
    const rest = masked.slice(endIndex);
    if (/^\s*\(/.test(rest)) {
      continue;
    }

    // Check if immediately preceded or followed by '.'
    const before = masked.slice(Math.max(0, startIndex - 2), startIndex);
    if (/\.\s*$/.test(before) || /^\s*\./.test(rest)) {
      continue;
    }

    // Check if preceded by AS (it is an alias definition)
    const precedingText = masked.slice(Math.max(0, startIndex - 10), startIndex);
    if (/\bas\s+$/i.test(precedingText)) {
      continue;
    }

    // Skip SQL keywords, data types, aliases, table names, CTE names
    if (
      STANDARD_SQL_KEYWORDS.has(wordLower) ||
      definedAliases.has(wordLower) ||
      cteNames.has(wordLower) ||
      tableAliases.has(wordLower)
    ) {
      continue;
    }

    results.push({
      name: word,
      startIndex,
      endIndex,
    });
  }

  return results;
}

// Isolate the FROM/JOIN section of a SQL statement so clause keywords
// (WHERE, HAVING, etc.) are never present when the alias-capture regex runs.
const extractFromSection = (sql: string): string => {
  const fromIdx = sql.toLowerCase().search(/\bfrom\b/);
  if (fromIdx === -1) return '';

  const fromText = sql.slice(fromIdx);
  // Stop at the first clause that cannot appear inside a FROM/JOIN list
  const boundary = /\b(?:where|group\s+by|order\s+by|having|limit|offset|union|intersect|except)\b/i.exec(fromText);
  const section = boundary ? fromText.slice(0, boundary.index) : fromText;

  // Strip ON <cond> and USING(...) within JOIN clauses so those keywords
  // are not captured as table aliases.
  return section
    .replace(/\bon\b.+?(?=\b(?:join|left|right|inner|outer|cross|natural)\b|$)/gis, ' ')
    .replace(/\busing\s*\([^)]*\)/gi, ' ');
};

// Returns alias → ParsedTableRef. Handles quoted identifiers, schema.table, and comma-separated FROM.
export const parseTablesFromQuery = (sql: string): Map<string, ParsedTableRef> | null => {
  if (!sql || sql.length === 0) return null;

  const fromSection = extractFromSection(sql);
  if (!fromSection) return null;

  const tableMap = new Map<string, ParsedTableRef>();
  const fromPattern =
    /(?:from|join|,)\s+("(?:[^"]|"")*"|`[^`]+`|[a-zA-Z_][a-zA-Z0-9_]*)(?:\.("(?:[^"]|"")*"|`[^`]+`|[a-zA-Z_][a-zA-Z0-9_]*))?(?:\s+(?:as\s+)?("(?:[^"]|"")*"|`[^`]+`|(?!(?:join|left|right|inner|outer|cross|natural|full|on|using|where|group|order|having|limit|offset|union|intersect|except|for|fetch|window|lateral|tablesample|qualify|straight_join)\b)[a-zA-Z_][a-zA-Z0-9_]*))?/gi;

  let match;
  let matchCount = 0;
  const MAX_MATCHES = 10;

  while ((match = fromPattern.exec(fromSection)) !== null && matchCount++ < MAX_MATCHES) {
    const schemaToken = match[2] ? match[1] : undefined;
    const tableToken = match[2] ?? match[1];
    if (!tableToken) continue;

    const tableName = stripIdentifierQuotes(tableToken);
    const schema = schemaToken ? stripIdentifierQuotes(schemaToken) : undefined;
    const aliasToken = match[3];
    const alias = aliasToken ? stripIdentifierQuotes(aliasToken) : tableName;
    tableMap.set(alias, { name: tableName, schema });
  }

  return tableMap.size > 0 ? tableMap : null;
};

// Strips comments and quoted literals so the keyword/depth scan below never
// matches text that only looks like SQL because it's inside a string or a
// comment. `\\.` handles backslash-escaped quotes (MySQL's default string
// escaping) in addition to the standard doubled-quote escaping.
const stripCommentsAndLiterals = (sql: string): string =>
  sql
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/'(?:[^'\\]|\\.|'')*'/g, "''")
    .replace(/"(?:[^"\\]|\\.|"")*"/g, '""')
    .replace(/`(?:[^`]|``)*`/g, '``');

const CTE_STATEMENT_KEYWORDS = new Set(['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'MERGE']);

// A data-modifying CTE (`WITH x AS (...) DELETE FROM t ...`) carries its
// real statement type after the CTE definitions, not at the start. Scan for
// the first keyword that sits outside any parenthesized CTE body.
function finalCteStatementKeyword(cleaned: string): string | null {
  const tokenRe = /\(|\)|[A-Za-z_][A-Za-z0-9_]*/g;
  let depth = 0;
  let match: RegExpExecArray | null;
  while ((match = tokenRe.exec(cleaned)) !== null) {
    const token = match[0];
    if (token === '(') { depth++; continue; }
    if (token === ')') { depth = Math.max(0, depth - 1); continue; }
    if (depth === 0) {
      const word = token.toUpperCase();
      if (CTE_STATEMENT_KEYWORDS.has(word)) return word;
    }
  }
  return null;
}

// True if `WHERE` appears outside of any parenthesized group — a WHERE
// nested in a subquery (e.g. an UPDATE...SET with a correlated subquery)
// doesn't count, since it doesn't limit which rows of the target table are
// affected.
function hasTopLevelWhere(cleaned: string): boolean {
  const tokenRe = /\(|\)|\bWHERE\b/gi;
  let depth = 0;
  let match: RegExpExecArray | null;
  while ((match = tokenRe.exec(cleaned)) !== null) {
    const token = match[0];
    if (token === '(') { depth++; continue; }
    if (token === ')') { depth = Math.max(0, depth - 1); continue; }
    if (depth === 0) return true;
  }
  return false;
}

// The distinct ways a statement can be flagged as dangerous. Each maps to its
// own confirmation copy so the dialog can explain the specific risk.
//   - 'no-where':  DELETE/UPDATE with no top-level WHERE (wipes a whole table)
//   - 'drop':      DROP removes an object (and its data) irreversibly
//   - 'truncate':  TRUNCATE empties a table irreversibly
export type DangerousQueryKind = 'no-where' | 'drop' | 'truncate';

// Classifies a single statement's danger, or null when it is safe to run
// without confirmation. Handles the same edge cases as the WHERE detection:
// comments, string literals, and data-modifying CTEs.
export const classifyDangerousQuery = (sql: string): DangerousQueryKind | null => {
  const cleaned = stripCommentsAndLiterals(sql);
  let keyword = leadingKeyword(cleaned);
  if (keyword === 'WITH') {
    keyword = finalCteStatementKeyword(cleaned) ?? keyword;
  }

  if (keyword === 'DROP') return 'drop';
  if (keyword === 'TRUNCATE') return 'truncate';
  if ((keyword === 'DELETE' || keyword === 'UPDATE') && !hasTopLevelWhere(cleaned)) {
    return 'no-where';
  }
  return null;
};

// True when a statement should be gated behind a confirmation dialog.
export const isDangerousQuery = (sql: string): boolean => classifyDangerousQuery(sql) !== null;

// Flags DELETE/UPDATE statements with no top-level WHERE clause — the
// classic "forgot the WHERE" accident that wipes or overwrites a whole
// table.
export const isDestructiveWithoutWhere = (sql: string): boolean =>
  classifyDangerousQuery(sql) === 'no-where';

// Optimized statement extractor - avoid full text scan when possible
export const getCurrentStatement = (model: { getValue: () => string; getOffsetAt: (position: { lineNumber: number; column: number }) => number }, position: { lineNumber: number; column: number }): string => {
  const fullText = model.getValue();

  // For small files, just return full text
  if (fullText.length < 500) {
    return fullText;
  }

  const offset = model.getOffsetAt(position);
  let start = 0;
  let end = fullText.length;

  // Search within reasonable bounds (±2000 chars from cursor)
  const searchStart = Math.max(0, offset - 2000);
  const searchEnd = Math.min(fullText.length, offset + 2000);

  // Find previous semicolon
  for (let i = offset - 1; i >= searchStart; i--) {
    if (fullText[i] === ';') {
      start = i + 1;
      break;
    }
  }

  // Find next semicolon
  for (let i = offset; i < searchEnd; i++) {
    if (fullText[i] === ';') {
      end = i;
      break;
    }
  }

  return fullText.substring(start, end).trim();
};
