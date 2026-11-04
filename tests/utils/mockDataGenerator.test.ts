import { describe, it, expect } from "vitest";
import {
  generateMockValue,
  generateMockRows,
  generateMockInsertSql,
} from "../../src/utils/mockDataGenerator";
import type { TableColumn } from "../../src/utils/sqlGenerator";

describe("mockDataGenerator", () => {
  const sampleColumns: TableColumn[] = [
    { name: "id", type: "integer", is_primary: true, nullable: false, default_value: null },
    { name: "email", type: "varchar(255)", is_primary: false, nullable: false, default_value: null },
    { name: "full_name", type: "varchar(100)", is_primary: false, nullable: false, default_value: null },
    { name: "is_active", type: "boolean", is_primary: false, nullable: false, default_value: null },
    { name: "price", type: "numeric(10,2)", is_primary: false, nullable: false, default_value: null },
  ];

  it("generates appropriate values based on column definitions", () => {
    const idVal = generateMockValue(sampleColumns[0], 0);
    expect(idVal).toBe(1);

    const emailVal = generateMockValue(sampleColumns[1], 0) as string;
    expect(emailVal).toContain("@");

    const nameVal = generateMockValue(sampleColumns[2], 0) as string;
    expect(nameVal.split(" ").length).toBeGreaterThanOrEqual(2);

    const boolVal = generateMockValue(sampleColumns[3], 0);
    expect(typeof boolVal).toBe("boolean");

    const priceVal = generateMockValue(sampleColumns[4], 0);
    expect(typeof priceVal).toBe("number");
  });

  it("generates correct number of rows", () => {
    const rows = generateMockRows(sampleColumns, 5);
    expect(rows.length).toBe(5);
    expect(rows[0].id).toBe(1);
    expect(rows[4].id).toBe(5);
    expect(rows[0].email).toBeDefined();
  });

  it("generates valid SQL INSERT query", () => {
    const rows = generateMockRows(sampleColumns, 2);
    const sql = generateMockInsertSql("users", sampleColumns, rows, "postgres");
    expect(sql).toContain('INSERT INTO "users"');
    expect(sql).toContain('"id", "email", "full_name", "is_active", "price"');
    expect(sql).toContain("VALUES");
    expect(sql).toContain(";");
  });
});
