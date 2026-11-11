import { describe, expect, it } from "vitest";
import {
  isSensitiveColumn,
  maskRecord,
  maskRows,
  maskSqlLiterals,
  parseExtraMaskedColumns,
} from "../../src/utils/dataMasking";

describe("isSensitiveColumn: Japanese and Vietnamese names", () => {
  it.each([
    "氏名", "氏名カナ", "電話番号", "携帯電話", "住所1", "メールアドレス", "生年月日", "給与額", "口座番号", "パスワード", "マイナンバー",
    "shimei", "denwa_bango", "keitai", "jusho", "seinengappi", "kyuyo", "kouza_no", "yubin_bango",
    "ho_ten", "hoten", "họ_tên", "sdt", "so_dt", "dien_thoai", "dienthoai", "địa_chỉ", "dia_chi_giao", "ngay_sinh", "luong_co_ban", "tai_khoan", "mat_khau", "so_the",
  ])("treats %s as sensitive", (name) => {
    expect(isSensitiveColumn(name)).toBe(true);
  });

  it.each(["id", "created_at", "status", "quantity", "商品名", "注文日", "ten_san_pham", "gia_ban", "order_total"])(
    "leaves %s alone",
    (name) => {
      expect(isSensitiveColumn(name)).toBe(false);
    },
  );
});

describe("isSensitiveColumn: user-defined extra columns", () => {
  it("matches a fragment anywhere in the name, ignoring case", () => {
    expect(isSensitiveColumn("KH_DT_2", ["kh_dt"])).toBe(true);
    expect(isSensitiveColumn("note_kh_dt", ["kh_dt"])).toBe(true);
  });

  it("does not change other columns", () => {
    expect(isSensitiveColumn("status", ["kh_dt"])).toBe(false);
  });

  it("ignores an empty extra entry, which would otherwise match every column", () => {
    expect(isSensitiveColumn("status", [""])).toBe(false);
  });
});

describe("parseExtraMaskedColumns", () => {
  it("splits on commas, semicolons and new lines, trims, lowercases and de-duplicates", () => {
    expect(parseExtraMaskedColumns(" KH_DT ,dia_chi;\n氏名カナ,, kh_dt ")).toEqual(["kh_dt", "dia_chi", "氏名カナ"]);
  });

  it.each([undefined, null, "", "  ", ",,;"])("returns nothing for %j", (value) => {
    expect(parseExtraMaskedColumns(value)).toEqual([]);
  });
});

describe("maskRows", () => {
  const columns = ["city", "email", "note"];
  const rows = [
    ["Hanoi", "alice@example.com", "vip"],
    ["Tokyo", "bob@example.com", null],
  ];

  it("masks only the sensitive columns", () => {
    const masked = maskRows(rows, columns, "full");
    expect(masked[0]).toEqual(["Hanoi", "••••••••", "vip"]);
    expect(masked[1]).toEqual(["Tokyo", "••••••••", null]);
  });

  it("uses the chosen profile", () => {
    expect(maskRows(rows, columns, "redacted")[0][1]).toBe("[REDACTED]");
  });

  it("includes the user's extra columns", () => {
    expect(maskRows(rows, columns, "full", ["note"])[0][2]).toBe("••••••••");
  });

  it("never changes the original rows", () => {
    const before = JSON.stringify(rows);
    maskRows(rows, columns, "full");
    expect(JSON.stringify(rows)).toBe(before);
  });

  it("returns copies even when nothing is sensitive", () => {
    const plain = [["a", "b"]];
    const result = maskRows(plain, ["x", "y"]);
    expect(result).toEqual(plain);
    expect(result[0]).not.toBe(plain[0]);
  });

  it("keeps NULL readable and handles an empty result", () => {
    expect(maskRows([[null]], ["email"], "full")[0][0]).toBe("NULL");
    expect(maskRows([], columns)).toEqual([]);
  });

  it("copes with rows shorter than the column list", () => {
    expect(maskRows([["Hanoi"]], columns, "full")).toEqual([["Hanoi"]]);
  });
});

describe("maskRecord", () => {
  it("masks sensitive keys and keeps the rest", () => {
    const record = { id: 7, email: "a@b.com", 氏名: "山田太郎" };
    expect(maskRecord(record, "full")).toEqual({ id: 7, email: "••••••••", 氏名: "••••••••" });
    expect(record.email).toBe("a@b.com");
  });
});

describe("maskSqlLiterals", () => {
  it("hides string literals and keeps the statement readable", () => {
    expect(maskSqlLiterals("SELECT * FROM users WHERE email = 'alice@example.com' AND name = 'Alice'")).toBe(
      "SELECT * FROM users WHERE email = '•••' AND name = '•••'",
    );
  });

  it("handles doubled quotes inside a literal", () => {
    expect(maskSqlLiterals("SELECT 'it''s secret', 1")).toBe("SELECT '•••', 1");
  });

  it("handles a backslash-escaped quote without leaking the rest", () => {
    const out = maskSqlLiterals("SELECT 'a\\'b secret' FROM t");
    expect(out).not.toContain("secret");
    expect(out).toContain("FROM t");
  });

  it("hides long numbers (phone, account, card) but keeps short ones", () => {
    expect(maskSqlLiterals("SELECT * FROM t WHERE phone = 0912345678 LIMIT 10 OFFSET 20")).toBe(
      "SELECT * FROM t WHERE phone = ••• LIMIT 10 OFFSET 20",
    );
  });

  it("does not touch digits inside identifiers", () => {
    expect(maskSqlLiterals("SELECT col1234567 FROM table12345678")).toBe("SELECT col1234567 FROM table12345678");
  });

  it("keeps quoted identifiers", () => {
    expect(maskSqlLiterals('SELECT "Order Id", `user name` FROM "Orders" WHERE a = \'x\'')).toBe(
      'SELECT "Order Id", `user name` FROM "Orders" WHERE a = \'•••\'',
    );
  });

  it("hides dollar-quoted strings", () => {
    expect(maskSqlLiterals("SELECT $$secret value$$, $tag$more$tag$")).toBe("SELECT $$•••$$, $tag$•••$tag$");
  });

  it("leaves comments alone, including a quote inside one", () => {
    expect(maskSqlLiterals("SELECT 1 -- it's a comment\nFROM t")).toBe("SELECT 1 -- it's a comment\nFROM t");
    expect(maskSqlLiterals("SELECT /* don't */ 'x'")).toBe("SELECT /* don't */ '•••'");
  });

  it("masks an unterminated literal to the end of the statement", () => {
    const out = maskSqlLiterals("SELECT 'oops this never closes AND secret");
    expect(out).not.toContain("secret");
  });

  it("is a no-op for SQL without values, and for empty input", () => {
    expect(maskSqlLiterals("SELECT id, name FROM users")).toBe("SELECT id, name FROM users");
    expect(maskSqlLiterals("")).toBe("");
  });

  it("keeps non-ASCII text outside literals", () => {
    expect(maskSqlLiterals("SELECT 氏名 FROM 顧客 WHERE 住所 = '東京都千代田区'")).toBe(
      "SELECT 氏名 FROM 顧客 WHERE 住所 = '•••'",
    );
  });
});
