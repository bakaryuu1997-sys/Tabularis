import { scanNonCodeSpans, type Dialect } from './sqlSplitter/index';

/**
 * Standard SQL keywords that should be automatically converted to UPPERCASE
 * as the developer types them in lowercase.
 */
export const AUTO_UPPERCASE_KEYWORDS: ReadonlySet<string> = new Set([
  // Query clauses
  'SELECT', 'FROM', 'WHERE', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'CROSS', 'FULL', 'NATURAL',
  'ON', 'AND', 'OR', 'NOT', 'NULL', 'IS', 'IN', 'BETWEEN', 'LIKE', 'ILIKE',
  'AS', 'DISTINCT', 'ALL', 'UNION', 'EXCEPT', 'INTERSECT',
  'GROUP', 'ORDER', 'BY', 'HAVING', 'LIMIT', 'OFFSET', 'FETCH', 'FIRST', 'ROWS', 'ONLY',
  // DML
  'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE',
  // DDL
  'CREATE', 'TABLE', 'VIEW', 'INDEX', 'DROP', 'ALTER', 'ADD', 'COLUMN', 'RENAME', 'TO',
  'PRIMARY', 'KEY', 'FOREIGN', 'REFERENCES', 'CONSTRAINT', 'DEFAULT', 'CHECK', 'UNIQUE',
  // Conditions & Flow
  'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
  // CTE
  'WITH', 'RECURSIVE',
  // Functions & Expressions
  'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'COALESCE', 'NULLIF', 'CAST',
  'TRUE', 'FALSE', 'ASC', 'DESC', 'EXISTS',
  // Administration
  'DATABASE', 'SCHEMA', 'USE', 'SHOW', 'DESCRIBE', 'EXPLAIN', 'TRUNCATE',
  'BEGIN', 'COMMIT', 'ROLLBACK', 'TRANSACTION', 'GRANT', 'REVOKE',
]);

/** Delimiters that mark the end of an SQL keyword token */
export const AUTO_UPPERCASE_DELIMITERS: ReadonlySet<string> = new Set([
  ' ',
  '\t',
  '\n',
  '\r\n',
  ';',
  ',',
  '(',
  ')',
]);

export interface AutoUppercaseCandidate {
  word: string;
  upper: string;
  startColumn: number;
  endColumn: number;
}

/**
 * Checks if a word typed immediately before a delimiter should be converted to uppercase.
 *
 * @param lineTextFull The current line text
 * @param delimiter The delimiter character that was just typed (e.g. ' ', '\n', '(')
 * @param changeStartColumn 1-indexed column in Monaco where the delimiter insertion started
 */
export function findAutoUppercaseCandidate(
  lineTextFull: string,
  delimiter: string,
  changeStartColumn: number,
): AutoUppercaseCandidate | null {
  if (!AUTO_UPPERCASE_DELIMITERS.has(delimiter)) {
    return null;
  }

  // Text preceding the delimiter
  const textBefore = lineTextFull.slice(0, changeStartColumn - 1);
  const match = textBefore.match(/([a-zA-Z_][a-zA-Z0-9_]*)$/);
  if (!match) return null;

  const word = match[1];
  const charBefore = textBefore.slice(0, -word.length).slice(-1);

  // If preceded by a dot (e.g. `users.select`), this is an identifier/column name, not a keyword
  if (charBefore === '.') {
    return null;
  }

  const upper = word.toUpperCase();

  // If not in keyword dictionary or already uppercase, skip
  if (!AUTO_UPPERCASE_KEYWORDS.has(upper) || word === upper) {
    return null;
  }

  return {
    word,
    upper,
    startColumn: changeStartColumn - word.length,
    endColumn: changeStartColumn,
  };
}

/**
 * Checks if a document offset falls within a string literal, comment, or quoted identifier.
 */
export function isOffsetInNonCodeSpan(
  offset: number,
  sqlText: string,
  dialect?: Dialect | string,
): boolean {
  const spans = scanNonCodeSpans(sqlText, dialect);
  for (const span of spans) {
    if (offset >= span.start && offset < span.end) {
      return true;
    }
  }
  return false;
}
