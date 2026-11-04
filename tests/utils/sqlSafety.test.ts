import { describe, it, expect } from "vitest";
import {
  checkSqlSafety,
  stripCommentsAndLiterals,
  isWriteQuery,
  resolveSafeModeLevel,
  resolveConnectionSafeMode,
  evaluateSafeMode,
} from "../../src/utils/sqlSafety";

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

describe("isWriteQuery", () => {
  it("identifies read queries", () => {
    expect(isWriteQuery("SELECT * FROM users")).toBe(false);
    expect(isWriteQuery("EXPLAIN SELECT 1")).toBe(false);
  });

  it("identifies write queries", () => {
    expect(isWriteQuery("INSERT INTO users (name) VALUES ('test')")).toBe(true);
    expect(isWriteQuery("UPDATE users SET name = 'test'")).toBe(true);
    expect(isWriteQuery("DELETE FROM users WHERE id = 1")).toBe(true);
    expect(isWriteQuery("DROP TABLE users")).toBe(true);
  });
});

describe("resolveSafeModeLevel", () => {
  it("respects explicit safe_mode", () => {
    expect(resolveSafeModeLevel("readonly", "development")).toBe("readonly");
    expect(resolveSafeModeLevel("silent", "production")).toBe("silent");
  });

  it("falls back to environment presets", () => {
    expect(resolveSafeModeLevel(null, "production")).toBe("strict");
    expect(resolveSafeModeLevel(null, "staging")).toBe("alert");
    expect(resolveSafeModeLevel(null, "development")).toBe("silent");
    expect(resolveSafeModeLevel(null, null)).toBe("silent");
  });
});

describe("evaluateSafeMode", () => {
  it("in readonly mode: blocks write queries immediately", () => {
    const writeCheck = evaluateSafeMode("DELETE FROM users WHERE id = 1", "readonly", "Production DB");
    expect(writeCheck.allowed).toBe(false);
    expect(writeCheck.requiresConfirmation).toBe(false);
    expect(writeCheck.reason).toContain("Chế độ Chỉ đọc");

    const readCheck = evaluateSafeMode("SELECT * FROM users", "readonly", "Production DB");
    expect(readCheck.allowed).toBe(true);
    expect(readCheck.requiresConfirmation).toBe(false);
  });

  it("in strict mode: requires confirmation for any write operation", () => {
    const writeCheck = evaluateSafeMode("UPDATE users SET active = 1 WHERE id = 5", "strict", "Prod");
    expect(writeCheck.allowed).toBe(true);
    expect(writeCheck.requiresConfirmation).toBe(true);
    expect(writeCheck.reason).toContain("Bảo vệ nghiêm ngặt");

    const readCheck = evaluateSafeMode("SELECT * FROM users", "strict", "Prod");
    expect(readCheck.allowed).toBe(true);
    expect(readCheck.requiresConfirmation).toBe(false);
  });

  it("in alert mode: requires confirmation only for destructive queries", () => {
    const safeUpdate = evaluateSafeMode("UPDATE users SET active = 1 WHERE id = 5", "alert");
    expect(safeUpdate.allowed).toBe(true);
    expect(safeUpdate.requiresConfirmation).toBe(false);

    const dangerousDelete = evaluateSafeMode("DELETE FROM users", "alert");
    expect(dangerousDelete.allowed).toBe(true);
    expect(dangerousDelete.requiresConfirmation).toBe(true);
    expect(dangerousDelete.reason).toContain("DELETE không có điều kiện WHERE");

    const dropTable = evaluateSafeMode("DROP TABLE users", "alert");
    expect(dropTable.allowed).toBe(true);
    expect(dropTable.requiresConfirmation).toBe(true);
  });

  it("in silent mode: allows everything without confirmation", () => {
    const drop = evaluateSafeMode("DROP TABLE users", "silent");
    expect(drop.allowed).toBe(true);
    expect(drop.requiresConfirmation).toBe(false);
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

describe("resolveConnectionSafeMode", () => {
  it("uses the level chosen in the connection appearance", () => {
    expect(resolveConnectionSafeMode({ appearance: { safeMode: "readonly" } })).toBe("readonly");
    expect(resolveConnectionSafeMode({ appearance: { safeMode: "strict" }, environment: "local" })).toBe("strict");
  });

  it("falls back to the legacy top-level safe_mode", () => {
    expect(resolveConnectionSafeMode({ safe_mode: "alert" })).toBe("alert");
  });

  it("defaults from the environment when nothing was chosen", () => {
    expect(resolveConnectionSafeMode({ environment: "production" })).toBe("strict");
    expect(resolveConnectionSafeMode({ appearance: { environment: "staging" } })).toBe("alert");
    expect(resolveConnectionSafeMode(undefined)).toBe("silent");
  });

  it("an explicit silent level overrides a production environment", () => {
    expect(resolveConnectionSafeMode({ appearance: { safeMode: "silent" }, environment: "production" })).toBe("silent");
  });
});
