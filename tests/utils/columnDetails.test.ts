import { describe, it, expect } from "vitest";
import { describeDataTypeValidation, buildColumnTooltip } from "../../src/utils/columnDetails";
import type { TableColumn, ForeignKey } from "../../src/types/editor";

describe("columnDetails", () => {
  describe("describeDataTypeValidation", () => {
    it("describes character types with maximum length", () => {
      expect(describeDataTypeValidation("varchar(255)", 255)).toContain("Tối đa 255 ký tự");
      expect(describeDataTypeValidation("char(8)", 8)).toContain("Tối đa 8 ký tự");
    });

    it("describes numeric types correctly", () => {
      expect(describeDataTypeValidation("int")).toContain("Số nguyên 32-bit");
      expect(describeDataTypeValidation("bigint")).toContain("Số nguyên lớn 64-bit");
      expect(describeDataTypeValidation("decimal(10,2)")).toContain("Số thập phân");
    });

    it("describes boolean and date types", () => {
      expect(describeDataTypeValidation("tinyint(1)")).toContain("Boolean");
      expect(describeDataTypeValidation("datetime")).toContain("Ngày & Giờ");
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

      const tooltip = buildColumnTooltip("id", meta, true, undefined, "Click để sắp xếp");
      expect(tooltip).toContain("id [BIGINT]");
      expect(tooltip).toContain("🔑 Khóa chính (Primary Key)");
      expect(tooltip).toContain("Bắt buộc (NOT NULL)");
      expect(tooltip).toContain("Tự động tăng (AUTO_INCREMENT)");
      expect(tooltip).toContain("Click để sắp xếp");
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
      expect(tooltip).toContain("🔗 Khóa ngoại ➔ Tham chiếu tới: customers.id");
      expect(tooltip).toContain("Cho phép NULL");
      expect(tooltip).toContain("Tối đa 36 ký tự");
    });
  });
});
