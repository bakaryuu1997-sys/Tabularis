import { describe, it, expect } from "vitest";
import { SQL_SNIPPETS, buildMonacoSqlSnippets } from "../../src/utils/sqlSnippets";

describe("SQL Snippets Engine", () => {
  it("defines essential developer shortcuts", () => {
    const labels = SQL_SNIPPETS.map((s) => s.label);
    expect(labels).toContain("sel");
    expect(labels).toContain("sc");
    expect(labels).toContain("ins");
    expect(labels).toContain("upd");
    expect(labels).toContain("del");
    expect(labels).toContain("join");
    expect(labels).toContain("where");
    expect(labels).toContain("groupby");
    expect(labels).toContain("having");
    expect(labels).toContain("orderby");
    expect(labels).toContain("limit");
    expect(labels).toContain("cte");
    expect(labels).toContain("query");
    expect(labels).toContain("fullquery");
  });

  it("sel expands to SELECT * FROM", () => {
    const sel = SQL_SNIPPETS.find((s) => s.label === "sel");
    expect(sel).toBeDefined();
    expect(sel?.insertText).toContain("SELECT");
    expect(sel?.insertText).toContain("FROM");
  });

  it("sc expands to SELECT COUNT(*)", () => {
    const sc = SQL_SNIPPETS.find((s) => s.label === "sc");
    expect(sc).toBeDefined();
    expect(sc?.insertText).toContain("COUNT(*)");
  });

  it("query follows full developer order (SELECT, FROM, JOIN, WHERE, GROUP BY, HAVING, ORDER BY, LIMIT)", () => {
    const query = SQL_SNIPPETS.find((s) => s.label === "query");
    expect(query).toBeDefined();
    const text = query!.insertText;
    const selectIdx = text.indexOf("SELECT");
    const fromIdx = text.indexOf("FROM");
    const joinIdx = text.indexOf("JOIN");
    const whereIdx = text.indexOf("WHERE");
    const groupIdx = text.indexOf("GROUP BY");
    const havingIdx = text.indexOf("HAVING");
    const orderIdx = text.indexOf("ORDER BY");
    const limitIdx = text.indexOf("LIMIT");

    expect(selectIdx).toBeLessThan(fromIdx);
    expect(fromIdx).toBeLessThan(joinIdx);
    expect(joinIdx).toBeLessThan(whereIdx);
    expect(whereIdx).toBeLessThan(groupIdx);
    expect(groupIdx).toBeLessThan(havingIdx);
    expect(havingIdx).toBeLessThan(orderIdx);
    expect(orderIdx).toBeLessThan(limitIdx);
  });

  it("buildMonacoSqlSnippets creates valid Monaco completion items", () => {
    const mockMonaco = {
      languages: {
        CompletionItemKind: { Snippet: 27 },
        CompletionItemInsertTextRule: { InsertAsSnippet: 4 },
      },
    } as never;

    const items = buildMonacoSqlSnippets(mockMonaco);
    expect(items.length).toBe(SQL_SNIPPETS.length);
    expect(items[0].kind).toBe(27);
    expect(items[0].insertTextRules).toBe(4);
    expect(items[0].label).toBe("sel");
  });
});
