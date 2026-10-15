import type * as Monaco from "monaco-editor";

export interface SqlSnippetDef {
  label: string;
  detail: string;
  documentation: string;
  insertText: string;
}

export const SQL_SNIPPETS: SqlSnippetDef[] = [
  {
    label: "sel",
    detail: "SELECT * FROM table",
    documentation: "1. SELECT - Chọn cột lấy ra từ bảng\nGõ nhanh câu lệnh SELECT lấy dữ liệu",
    insertText: "SELECT ${1:*} FROM ${2:table_name};",
  },
  {
    label: "select",
    detail: "SELECT columns FROM table",
    documentation: "1. SELECT - Mệnh đề SELECT chọn cột",
    insertText: "SELECT ${1:*} FROM ${2:table_name};",
  },
  {
    label: "sc",
    detail: "SELECT COUNT(*) FROM table",
    documentation: "SELECT COUNT(*) - Đếm số lượng dòng dữ liệu",
    insertText: "SELECT COUNT(*) FROM ${1:table_name};",
  },
  {
    label: "from",
    detail: "FROM table_name AS alias",
    documentation: "2. FROM - Nguồn bảng dữ liệu",
    insertText: "FROM ${1:table_name} AS ${2:t1}",
  },
  {
    label: "join",
    detail: "INNER JOIN table ON condition",
    documentation: "2. JOIN - Kết nối bảng trong FROM clause",
    insertText: "INNER JOIN ${1:table_name} ON ${2:condition}",
  },
  {
    label: "leftjoin",
    detail: "LEFT JOIN table ON condition",
    documentation: "2. LEFT JOIN - Kết nối bảng bên trái",
    insertText: "LEFT JOIN ${1:table_name} ON ${2:condition}",
  },
  {
    label: "rightjoin",
    detail: "RIGHT JOIN table ON condition",
    documentation: "2. RIGHT JOIN - Kết nối bảng bên phải",
    insertText: "RIGHT JOIN ${1:table_name} ON ${2:condition}",
  },
  {
    label: "where",
    detail: "WHERE condition",
    documentation: "3. WHERE - Điều kiện lọc dòng",
    insertText: "WHERE ${1:condition}",
  },
  {
    label: "groupby",
    detail: "GROUP BY column",
    documentation: "4. GROUP BY - Gom nhóm dữ liệu",
    insertText: "GROUP BY ${1:column}",
  },
  {
    label: "having",
    detail: "HAVING condition",
    documentation: "5. HAVING - Lọc trên nhóm sau gom nhóm",
    insertText: "HAVING ${1:condition}",
  },
  {
    label: "orderby",
    detail: "ORDER BY column ASC/DESC",
    documentation: "6. ORDER BY - Sắp xếp kết quả",
    insertText: "ORDER BY ${1:column} ${2|ASC,DESC|}",
  },
  {
    label: "limit",
    detail: "LIMIT count OFFSET offset",
    documentation: "7. LIMIT / OFFSET - Phân trang dữ liệu",
    insertText: "LIMIT ${1:50} OFFSET ${2:0}",
  },
  {
    label: "ins",
    detail: "INSERT INTO table (cols) VALUES (vals)",
    documentation: "INSERT INTO - Thêm mới bản ghi vào bảng",
    insertText: "INSERT INTO ${1:table_name} (${2:column1, column2})\nVALUES (${3:value1, value2});",
  },
  {
    label: "upd",
    detail: "UPDATE table SET col = val WHERE cond",
    documentation: "UPDATE ... SET ... WHERE - Cập nhật dữ liệu",
    insertText: "UPDATE ${1:table_name}\nSET ${2:column} = ${3:value}\nWHERE ${4:condition};",
  },
  {
    label: "del",
    detail: "DELETE FROM table WHERE cond",
    documentation: "DELETE FROM ... WHERE - Xóa bản ghi",
    insertText: "DELETE FROM ${1:table_name}\nWHERE ${2:condition};",
  },
  {
    label: "cte",
    detail: "WITH cte AS (...) SELECT ...",
    documentation: "WITH (CTE) - Bảng tạm Common Table Expression",
    insertText: "WITH ${1:cte_name} AS (\n  SELECT ${2:*}\n  FROM ${3:source_table}\n  WHERE ${4:condition}\n)\nSELECT *\nFROM ${1:cte_name};",
  },
  {
    label: "case",
    detail: "CASE WHEN ... THEN ... ELSE ... END",
    documentation: "CASE biểu thức điều kiện trong SQL",
    insertText: "CASE\n  WHEN ${1:condition} THEN ${2:result}\n  ELSE ${3:default_result}\nEND",
  },
  {
    label: "query",
    detail: "Full SQL Developer Query Flow (SELECT -> FROM -> JOIN -> WHERE -> GROUP -> HAVING -> ORDER -> LIMIT)",
    documentation: "Thứ tự LẬP TRÌNH VIÊN VIẾT:\n1. SELECT (Chọn cột lấy ra)\n2. FROM & JOIN (Nguồn bảng)\n3. WHERE (Điều kiện lọc dòng)\n4. GROUP BY (Gom nhóm)\n5. HAVING (Lọc trên nhóm)\n6. ORDER BY (Sắp xếp)\n7. LIMIT / OFFSET (Phân trang)",
    insertText: "SELECT\n  ${1:t1.*}\nFROM ${2:table1} AS t1\nLEFT JOIN ${3:table2} AS t2 ON ${4:t2.fk = t1.id}\nWHERE ${5:1=1}\nGROUP BY ${6:t1.id}\nHAVING ${7:COUNT(*) > 0}\nORDER BY ${8:t1.id} DESC\nLIMIT ${9:50} OFFSET ${10:0};",
  },
  {
    label: "fullquery",
    detail: "Full SQL Developer Query Flow (SELECT -> FROM -> WHERE -> GROUP BY -> HAVING -> ORDER BY -> LIMIT)",
    documentation: "Chuẩn mẫu câu truy vấn SQL hoàn chỉnh theo thứ tự lập trình viên",
    insertText: "SELECT\n  ${1:t1.*}\nFROM ${2:table1} AS t1\nLEFT JOIN ${3:table2} AS t2 ON ${4:t2.fk = t1.id}\nWHERE ${5:1=1}\nGROUP BY ${6:t1.id}\nHAVING ${7:COUNT(*) > 0}\nORDER BY ${8:t1.id} DESC\nLIMIT ${9:50} OFFSET ${10:0};",
  },
];

let snippetsRegistered = false;

/**
 * Creates Monaco completion items for all SQL snippets.
 */
export function buildMonacoSqlSnippets(
  monaco: typeof Monaco,
  range?: Monaco.IRange,
): Monaco.languages.CompletionItem[] {
  return SQL_SNIPPETS.map((snippet, index) => {
    const item: Monaco.languages.CompletionItem = {
      label: snippet.label,
      kind: monaco.languages.CompletionItemKind.Snippet,
      detail: `Snippet · ${snippet.detail}`,
      documentation: snippet.documentation,
      insertText: snippet.insertText,
      insertTextRules:
        monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      range: range ?? {
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 1,
        endColumn: 1,
      },
      // Sort snippets nicely so they show up at top when typing snippet trigger
      sortText: `0_snippet_${String(index).padStart(2, "0")}_${snippet.label}`,
    };
    return item;
  });
}

/**
 * Registers SQL snippets provider globally in Monaco (once per application run).
 */
export function registerMonacoSqlSnippets(monaco: typeof Monaco): void {
  if (snippetsRegistered) return;
  snippetsRegistered = true;

  monaco.languages.registerCompletionItemProvider("sql", {
    provideCompletionItems: (model, position) => {
      const word = model.getWordUntilPosition(position);
      const range: Monaco.IRange = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };
      return {
        suggestions: buildMonacoSqlSnippets(monaco, range),
      };
    },
  });
}
