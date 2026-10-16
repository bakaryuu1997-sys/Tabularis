import { describe, it, expect } from "vitest";
import { checkSqlSafety, stripCommentsAndLiterals } from "../../src/utils/sqlSafety";

describe("stripCommentsAndLiterals", () => {
  it("removes line comments and string contents", () => {
    const raw = "SELECT * FROM users WHERE note = 'where is my drop' -- DROP TABLE users";
    const cleaned = stripCommentsAndLiterals(raw);
    expect(cleaned).not.toContain("where is my drop");
    expect(cleaned).not.toContain("DROP TABLE");
  });

  it("removes block comments", () => {
    const raw = "DELETE /* this is a comment */ FROM users WHERE id = 1";
    const cleaned = stripCommentsAndLiterals(raw);
    expect(cleaned).toBe("DELETE  FROM users WHERE id = 1");
  });
});

describe("checkSqlSafety", () => {
  it("allows safe SELECT query", () => {
    const res = checkSqlSafety("SELECT * FROM users WHERE status = 'active';", "development");
    expect(res.isDangerous).toBe(false);
    expect(res.dangerTypes).toHaveLength(0);
  });

  it("flags DROP TABLE as dangerous", () => {
    const res = checkSqlSafety("DROP TABLE customers;", "development");
    expect(res.isDangerous).toBe(true);
    expect(res.dangerTypes).toContain("drop");
  });

  it("flags TRUNCATE as dangerous", () => {
    const res = checkSqlSafety("TRUNCATE TABLE logs;", "development");
    expect(res.isDangerous).toBe(true);
    expect(res.dangerTypes).toContain("truncate");
  });

  it("flags DELETE without WHERE clause as dangerous", () => {
    const res = checkSqlSafety("DELETE FROM orders;", "development");
    expect(res.isDangerous).toBe(true);
    expect(res.dangerTypes).toContain("delete_no_where");
  });

  it("allows DELETE with WHERE clause", () => {
    const res = checkSqlSafety("DELETE FROM orders WHERE id = 10;", "development");
    expect(res.isDangerous).toBe(false);
  });

  it("flags UPDATE without WHERE clause as dangerous", () => {
    const res = checkSqlSafety("UPDATE users SET is_active = false;", "development");
    expect(res.isDangerous).toBe(true);
    expect(res.dangerTypes).toContain("update_no_where");
  });

  it("flags write queries targeting PRODUCTION", () => {
    const res = checkSqlSafety("UPDATE users SET is_active = false WHERE id = 1;", "production");
    expect(res.isDangerous).toBe(true);
    expect(res.dangerTypes).toContain("production_target");
  });
});
