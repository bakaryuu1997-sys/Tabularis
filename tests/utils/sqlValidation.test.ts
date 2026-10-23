import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateSqlSchema, clearAutocompleteCache } from '../../src/utils/autocomplete';
import type { TableInfo } from '../../src/contexts/DatabaseContext';

// Mock Tauri invoke
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

import { invoke } from '@tauri-apps/api/core';

describe('SQL Schema and Column Validation Engine', () => {
  const tables: TableInfo[] = [
    { name: 'users' },
    { name: 'orders' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    clearAutocompleteCache('conn-test');
  });

  const createMockModel = (sql: string) => ({
    getValue: () => sql,
    getPositionAt: (offset: number) => {
      const lines = sql.slice(0, offset).split('\n');
      return {
        lineNumber: lines.length,
        column: lines[lines.length - 1].length + 1,
      };
    },
    getOffsetAt: (pos: { lineNumber: number; column: number }) => {
      const lines = sql.split('\n');
      let off = 0;
      for (let i = 0; i < pos.lineNumber - 1; i++) {
        off += lines[i].length + 1;
      }
      return off + pos.column - 1;
    },
  });

  it('marks non-existent table in FROM clause with Error marker', () => {
    const setModelMarkers = vi.fn();
    const monaco = {
      editor: { setModelMarkers },
      MarkerSeverity: { Error: 8, Warning: 4 },
    } as any;

    const model = createMockModel('SELECT * FROM khong_ton_tai;');
    validateSqlSchema(monaco, model, tables);

    expect(setModelMarkers).toHaveBeenCalledWith(
      model,
      'tabularis-sql-lint',
      expect.arrayContaining([
        expect.objectContaining({
          severity: 8,
          message: expect.stringContaining('khong_ton_tai'),
        }),
      ])
    );
  });

  it('marks non-existent table in UPDATE statement', () => {
    const setModelMarkers = vi.fn();
    const monaco = {
      editor: { setModelMarkers },
      MarkerSeverity: { Error: 8 },
    } as any;

    const model = createMockModel('UPDATE invalid_tbl SET active = 1 WHERE id = 1;');
    validateSqlSchema(monaco, model, tables);

    expect(setModelMarkers).toHaveBeenCalledWith(
      model,
      'tabularis-sql-lint',
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining('invalid_tbl'),
        }),
      ])
    );
  });

  it('marks non-existent table in INSERT statement', () => {
    const setModelMarkers = vi.fn();
    const monaco = {
      editor: { setModelMarkers },
      MarkerSeverity: { Error: 8 },
    } as any;

    const model = createMockModel('INSERT INTO tbl_sai (id) VALUES (1);');
    validateSqlSchema(monaco, model, tables);

    expect(setModelMarkers).toHaveBeenCalledWith(
      model,
      'tabularis-sql-lint',
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining('tbl_sai'),
        }),
      ])
    );
  });

  it('does NOT mark CTE as missing table', () => {
    const setModelMarkers = vi.fn();
    const monaco = {
      editor: { setModelMarkers },
      MarkerSeverity: { Error: 8 },
    } as any;

    const model = createMockModel('WITH my_cte AS (SELECT id FROM users) SELECT * FROM my_cte;');
    validateSqlSchema(monaco, model, tables);

    expect(setModelMarkers).toHaveBeenCalledWith(
      model,
      'tabularis-sql-lint',
      []
    );
  });

  it('marks non-existent qualified column (u.bad_col)', async () => {
    const setModelMarkers = vi.fn();
    const monaco = {
      editor: { setModelMarkers },
      MarkerSeverity: { Error: 8 },
    } as any;

    (invoke as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { name: 'id', data_type: 'integer' },
      { name: 'email', data_type: 'varchar' },
    ]);

    const model = createMockModel('SELECT u.id, u.cot_khong_ton_tai FROM users u;');
    validateSqlSchema(monaco, model, tables, { connectionId: 'conn-test' });

    // Wait a tick for async column fetch
    await new Promise((r) => setTimeout(r, 50));

    expect(setModelMarkers).toHaveBeenCalledWith(
      model,
      'tabularis-sql-lint',
      expect.arrayContaining([
        expect.objectContaining({
          severity: 8,
          message: expect.stringContaining('cot_khong_ton_tai'),
        }),
      ])
    );
  });

  it('marks non-existent unqualified column in single-table query', async () => {
    const setModelMarkers = vi.fn();
    const monaco = {
      editor: { setModelMarkers },
      MarkerSeverity: { Error: 8 },
    } as any;

    (invoke as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { name: 'id', data_type: 'integer' },
      { name: 'email', data_type: 'varchar' },
    ]);

    const model = createMockModel('SELECT id, cot_sai FROM users;');
    validateSqlSchema(monaco, model, tables, { connectionId: 'conn-test' });

    await new Promise((r) => setTimeout(r, 50));

    expect(setModelMarkers).toHaveBeenCalledWith(
      model,
      'tabularis-sql-lint',
      expect.arrayContaining([
        expect.objectContaining({
          severity: 8,
          message: expect.stringContaining('cot_sai'),
        }),
      ])
    );
  });

  it('does NOT mark functions or aliases as missing columns', async () => {
    const setModelMarkers = vi.fn();
    const monaco = {
      editor: { setModelMarkers },
      MarkerSeverity: { Error: 8 },
    } as any;

    (invoke as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { name: 'id', data_type: 'integer' },
      { name: 'name', data_type: 'varchar' },
    ]);

    const model = createMockModel('SELECT COUNT(id), name AS user_name FROM users ORDER BY user_name;');
    validateSqlSchema(monaco, model, tables, { connectionId: 'conn-test' });

    await new Promise((r) => setTimeout(r, 50));

    expect(setModelMarkers).toHaveBeenCalledWith(
      model,
      'tabularis-sql-lint',
      []
    );
  });
});
