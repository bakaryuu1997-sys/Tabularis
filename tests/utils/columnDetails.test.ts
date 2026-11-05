import { describe, it, expect } from "vitest";
import { describeDataTypeValidation, buildColumnTooltip } from "../../src/utils/columnDetails";
import type { TableColumn, ForeignKey } from "../../src/types/editor";

describe("columnDetails", () => {
  describe("describeDataTypeValidation", () => {
    it("describes character types with maximum length", () => {
      expect(describeDataTypeValidation("varchar(255)", 255)).toContain("up to 255 characters");
      expect(describeDataTypeValidation("char(8)", 8)).toContain("up to 8 characters");
    });

    it("describes numeric types correctly", () => {
      expect(describeDataTypeValidation("int")).toContain("32-bit integer");
      expect(describeDataTypeValidation("bigint")).toContain("64-bit big integer");
      expect(describeDataTypeValidation("decimal(10,2)")).toContain("High-precision decimal");
    });

    it("describes boolean and date types", () => {
      expect(describeDataTypeValidation("tinyint(1)")).toContain("Boolean");
      expect(describeDataTypeValidation("datetime")).toContain("Date & time");
      expect(describeDataTypeValidation("json")).toContain("JSON");
    });
  });

  describe("buildColumnTooltip", () => {
    it("builds detailed tooltip for a PK column", () => {
      const meta: TableColumn = {
        name: "id",
        data_type: "bigint",
        is_pk: true,
        is_nullable: false,
        is_auto_increment: true,
      };

      const tooltip = buildColumnTooltip("id", meta, true, undefined, "Click to sort");
      expect(tooltip).toContain("id [BIGINT]");
      expect(tooltip).toContain("🔑 Primary key");
      expect(tooltip).toContain("required (NOT NULL)");
      expect(tooltip).toContain("Auto-increment (AUTO_INCREMENT)");
      expect(tooltip).toContain("Click to sort");
    });

    it("builds detailed tooltip for a FK column with reference", () => {
      const meta: TableColumn = {
        name: "customer_id",
        data_type: "varchar(36)",
        is_pk: false,
        is_nullable: true,
        is_auto_increment: false,
        character_maximum_length: 36,
      };
      const fk: ForeignKey = {
        column_name: "customer_id",
        ref_table: "customers",
        ref_column: "id",
      };

      const tooltip = buildColumnTooltip("customer_id", meta, false, fk);
      expect(tooltip).toContain("customer_id [VARCHAR(36)]");
      expect(tooltip).toContain("🔗 Foreign key ➔ references: customers.id");
      expect(tooltip).toContain("allows NULL");
      expect(tooltip).toContain("up to 36 characters");
    });
  });
});
