import { describe, it, expect } from 'vitest';
import {
  findAutoUppercaseCandidate,
  isOffsetInNonCodeSpan,
  AUTO_UPPERCASE_KEYWORDS,
} from '../../src/utils/sqlAutoUppercase';

describe('sqlAutoUppercase', () => {
  it('detects lowercase "select" followed by a space', () => {
    // User types "select " -> line has "select "
    // changeStartColumn = 7 (1-indexed, space starts at 7)
    const result = findAutoUppercaseCandidate('select ', ' ', 7);
    expect(result).not.toBeNull();
    expect(result?.word).toBe('select');
    expect(result?.upper).toBe('SELECT');
    expect(result?.startColumn).toBe(1);
    expect(result?.endColumn).toBe(7);
  });

  it('detects "from" after columns', () => {
    // "SELECT id, name from "
    // "SELECT id, name from" has length 20. Space is at 21.
    const line = 'SELECT id, name from ';
    const result = findAutoUppercaseCandidate(line, ' ', 21);
    expect(result).not.toBeNull();
    expect(result?.word).toBe('from');
    expect(result?.upper).toBe('FROM');
    expect(result?.startColumn).toBe(17);
    expect(result?.endColumn).toBe(21);
  });

  it('detects keywords followed by newline or parenthesis', () => {
    const nlResult = findAutoUppercaseCandidate('where\n', '\n', 6);
    expect(nlResult?.upper).toBe('WHERE');

    const fnResult = findAutoUppercaseCandidate('count(', '(', 6);
    expect(fnResult?.upper).toBe('COUNT');
  });

  it('ignores already uppercase keywords', () => {
    const result = findAutoUppercaseCandidate('SELECT ', ' ', 7);
    expect(result).toBeNull();
  });

  it('ignores identifiers preceded by a dot', () => {
    // e.g. "users.select "
    const result = findAutoUppercaseCandidate('users.select ', ' ', 13);
    expect(result).toBeNull();
  });

  it('ignores non-keyword words', () => {
    const result = findAutoUppercaseCandidate('user_table ', ' ', 11);
    expect(result).toBeNull();
  });

  it('ignores non-delimiters', () => {
    const result = findAutoUppercaseCandidate('selecta', 'a', 7);
    expect(result).toBeNull();
  });

  describe('isOffsetInNonCodeSpan', () => {
    it('detects inside single-quoted string literals', () => {
      const sql = "SELECT 'select inside string' FROM users;";
      // 'select inside string' starts around index 7
      expect(isOffsetInNonCodeSpan(10, sql, 'postgres')).toBe(true);
      // 'FROM' at index 30 is outside quotes
      expect(isOffsetInNonCodeSpan(30, sql, 'postgres')).toBe(false);
    });

    it('detects inside line comments', () => {
      const sql = "-- select this\nSELECT * FROM t;";
      expect(isOffsetInNonCodeSpan(5, sql, 'postgres')).toBe(true);
      expect(isOffsetInNonCodeSpan(18, sql, 'postgres')).toBe(false);
    });

    it('detects inside block comments', () => {
      const sql = "/* select comment */ SELECT * FROM t;";
      expect(isOffsetInNonCodeSpan(5, sql, 'postgres')).toBe(true);
      expect(isOffsetInNonCodeSpan(25, sql, 'postgres')).toBe(false);
    });
  });
});
