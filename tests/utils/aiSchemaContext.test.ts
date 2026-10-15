import { describe, it, expect } from "vitest";
import {
  formatForeignKeyString,
  maskSensitiveValue,
  buildRichSchemaContext,
} from "../../src/utils/aiSchemaContext";
import type { TableSchema } from "../../src/types/editor";

describe("aiSchemaContext", () => {
  it("formats foreign keys accurately", () => {
    const fk = {
      constraint_name: "fk_orders_user",
      table_name: "orders",
      column_name: "user_id",
      foreign_table_name: "users",
      foreign_column_name: "id",
    };
    expect(formatForeignKeyString(fk)).toBe("user_id -> users(id)");
  });

  it("masks sensitive column values in sample data", () => {
    expect(maskSensitiveValue("password", "superSecret123")).toBe("***MASKED***");
    expect(maskSensitiveValue("api_key", "sk-12345")).toBe("***MASKED***");
    expect(maskSensitiveValue("username", "admin")).toBe("admin");
    expect(maskSensitiveValue("status", "active")).toBe("active");
  });

  it("builds rich schema context with columns and foreign keys", () => {
    const tables: TableSchema[] = [
      {
        name: "users",
        columns: [
          { name: "id", data_type: "int", is_pk: true, is_nullable: false, is_auto_increment: true },
          { name: "email", data_type: "varchar", is_pk: false, is_nullable: false, is_auto_increment: false },
        ],
        foreign_keys: [],
      },
      {
        name: "orders",
        columns: [
          { name: "id", data_type: "int", is_pk: true, is_nullable: false, is_auto_increment: true },
          { name: "user_id", data_type: "int", is_pk: false, is_nullable: false, is_auto_increment: false },
          { name: "status", data_type: "varchar", is_pk: false, is_nullable: false, is_auto_increment: false },
        ],
        foreign_keys: [
          {
            constraint_name: "fk_orders_user",
            table_name: "orders",
            column_name: "user_id",
            foreign_table_name: "users",
            foreign_column_name: "id",
          },
        ],
      },
    ];

    const context = buildRichSchemaContext(tables);
    expect(context).toContain("users(id int PK, email varchar)");
    expect(context).toContain("orders(id int PK, user_id int, status varchar; FK: user_id -> users(id))");
  });

  it("embeds sample rows when provided", () => {
    const tables: TableSchema[] = [
      {
        name: "statuses",
        columns: [
          { name: "code", data_type: "varchar", is_pk: true, is_nullable: false, is_auto_increment: false },
        ],
        foreign_keys: [],
      },
    ];
    const sampleData = {
      statuses: [
        { code: "PAID" },
        { code: "PENDING" },
      ],
    };

    const context = buildRichSchemaContext(tables, { sampleData });
    expect(context).toContain("Sample rows for statuses:");
    expect(context).toContain("PAID");
  });

  it("includes all tables in database and header list without truncating at 50", () => {
    const tables: TableSchema[] = Array.from({ length: 80 }, (_, i) => ({
      name: `tbl_${i}`,
      columns: [{ name: "id", data_type: "int", is_pk: true, is_nullable: false, is_auto_increment: true }],
      foreign_keys: [],
    }));

    const context = buildRichSchemaContext(tables);
    expect(context).toContain("Database Schema (80 tables total:");
    expect(context).toContain("tbl_0(id int PK)");
    expect(context).toContain("tbl_79(id int PK)");
    expect(context).not.toContain("more tables");
  });
});
