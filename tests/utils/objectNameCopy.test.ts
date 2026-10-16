import { describe, it, expect } from "vitest";
import { formatObjectNameForCopy } from "../../src/utils/objectNameCopy";

describe("formatObjectNameForCopy", () => {
  it("returns unquoted plain name", () => {
    expect(formatObjectNameForCopy("users", "name", "postgres")).toBe("users");
  });

  it("returns driver-quoted identifier", () => {
    expect(formatObjectNameForCopy("users", "quoted", "postgres")).toBe('"users"');
    expect(formatObjectNameForCopy("users", "quoted", "mysql")).toBe("`users`");
  });

  it("returns qualified identifier with schema", () => {
    expect(formatObjectNameForCopy("users", "qualified", "postgres", "public")).toBe(
      '"public"."users"',
    );
    expect(formatObjectNameForCopy("users", "qualified", "mysql", "my_db")).toBe(
      "`my_db`.`users`",
    );
  });

  it("returns select query with quoted table", () => {
    expect(formatObjectNameForCopy("users", "select", "postgres", "public")).toBe(
      'SELECT * FROM "public"."users" LIMIT 100;',
    );
    expect(formatObjectNameForCopy("orders", "select", "mysql")).toBe(
      "SELECT * FROM `orders` LIMIT 100;",
    );
  });
});
