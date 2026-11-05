import { describe, it, expect } from "vitest";
import { getColumnTypeVisual } from "../../src/utils/columnTypeBadge";

describe("getColumnTypeVisual", () => {
  it("classifies number types accurately", () => {
    expect(getColumnTypeVisual("bigint").shortName).toBe("INT8");
    expect(getColumnTypeVisual("integer").shortName).toBe("INT");
    expect(getColumnTypeVisual("decimal(10,2)").shortName).toBe("DEC");
    expect(getColumnTypeVisual("double precision").shortName).toBe("FLOAT");
    expect(getColumnTypeVisual("serial").shortName).toBe("SERIAL");
  });

  it("classifies date and timestamp types", () => {
    expect(getColumnTypeVisual("timestamp with time zone").shortName).toBe("TS");
    expect(getColumnTypeVisual("date").shortName).toBe("DATE");
    expect(getColumnTypeVisual("time without time zone").shortName).toBe("TIME");
  });

  it("classifies boolean and json types", () => {
    expect(getColumnTypeVisual("boolean").shortName).toBe("BOOL");
    expect(getColumnTypeVisual("jsonb").shortName).toBe("JSONB");
    expect(getColumnTypeVisual("json").shortName).toBe("JSON");
  });

  it("classifies uuid and binary", () => {
    expect(getColumnTypeVisual("uuid").shortName).toBe("UUID");
    expect(getColumnTypeVisual("bytea").shortName).toBe("BIN");
  });

  it("classifies string types", () => {
    expect(getColumnTypeVisual("varchar(255)").shortName).toBe("VARCHAR");
    expect(getColumnTypeVisual("text").shortName).toBe("TEXT");
    expect(getColumnTypeVisual("character(10)").shortName).toBe("CHAR");
  });

  it("handles null or undefined gracefully", () => {
    expect(getColumnTypeVisual(null).shortName).toBe("ANY");
    expect(getColumnTypeVisual(undefined).shortName).toBe("ANY");
  });
});
