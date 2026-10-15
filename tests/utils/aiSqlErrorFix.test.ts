import { describe, it, expect } from "vitest";
import {
  buildSqlErrorPrompt,
  formatSqlErrorForAi,
} from "../../src/utils/aiSqlErrorFix";

describe("aiSqlErrorFix", () => {
  it("formats error text cleanly", () => {
    const raw = "ERROR 1054 (42S22): Unknown column 'usr_id' in 'where clause'";
    expect(formatSqlErrorForAi(raw)).toBe(raw);
    expect(formatSqlErrorForAi("")).toBe("Unknown error");
  });

  it("builds an actionable error prompt with SQL and error message", () => {
    const query = "SELECT * FROM users WHERE usr_id = 1;";
    const error = "Unknown column 'usr_id' in 'where clause'";
    const prompt = buildSqlErrorPrompt(query, error);

    expect(prompt).toContain("SELECT * FROM users WHERE usr_id = 1;");
    expect(prompt).toContain("Unknown column 'usr_id'");
    expect(prompt).toContain("sửa lại câu lệnh SQL");
  });
});
