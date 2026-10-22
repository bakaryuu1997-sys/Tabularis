import { describe, it, expect } from "vitest";
import { compareSchemas } from "../../src/utils/schemaDiff";
import type { TableColumn } from "../../src/utils/sqlGenerator";

describe("schemaDiff", () => {
  it("detects identical schemas", () => {
    const tables = [{ name: "users" }];
    const cols: Record<string, TableColumn[]> = {
      users: [
        { name: "id", type: "integer", is_primary: true, nullable: false, default_value: null },
        { name: "name", type: "varchar(100)", is_primary: false, nullable: false, default_value: null },
      ],
    };

    const res = compareSchemas(tables, cols, tables, cols, "postgres");
    expect(res.summary.identicalCount).toBe(1);
    expect(res.summary.sourceOnlyCount).toBe(0);
    expect(res.summary.differentCount).toBe(0);
    expect(res.migrationSql).toContain("Schemas are identical");
  });

  it("detects missing table in target and generates CREATE TABLE", () => {
    const srcTables = [{ name: "orders" }];
    const srcCols = {
      orders: [
        { name: "id", type: "integer", is_primary: true, nullable: false, default_value: null },
        { name: "amount", type: "numeric(10,2)", is_primary: false, nullable: false, default_value: null },
      ],
    };

    const res = compareSchemas(srcTables, srcCols, [], {}, "postgres");
    expect(res.summary.sourceOnlyCount).toBe(1);
    expect(res.migrationSql).toContain('CREATE TABLE "orders"');
    expect(res.migrationSql).toContain('"id" integer PRIMARY KEY');
    expect(res.migrationSql).toContain('"amount" numeric(10,2)');
  });

  it("detects missing column in target table and generates ALTER TABLE ADD COLUMN", () => {
    const tables = [{ name: "users" }];
    const srcCols = {
      users: [
        { name: "id", type: "integer", is_primary: true, nullable: false, default_value: null },
        { name: "email", type: "varchar(255)", is_primary: false, nullable: false, default_value: null },
      ],
    };
    const tgtCols = {
      users: [
        { name: "id", type: "integer", is_primary: true, nullable: false, default_value: null },
      ],
    };

    const res = compareSchemas(tables, srcCols, tables, tgtCols, "postgres");
    expect(res.summary.differentCount).toBe(1);
    expect(res.migrationSql).toContain('ALTER TABLE "users" ADD COLUMN "email" varchar(255);');
  });

  it("detects data type mismatch and generates ALTER TABLE ALTER COLUMN TYPE", () => {
    const tables = [{ name: "products" }];
    const srcCols = {
      products: [
        { name: "price", type: "numeric(12,2)", is_primary: false, nullable: false, default_value: null },
      ],
    };
    const tgtCols = {
      products: [
        { name: "price", type: "integer", is_primary: false, nullable: false, default_value: null },
      ],
    };

    const res = compareSchemas(tables, srcCols, tables, tgtCols, "postgres");
    expect(res.summary.differentCount).toBe(1);
    expect(res.migrationSql).toContain('ALTER TABLE "products" ALTER COLUMN "price" TYPE numeric(12,2);');
  });
});
