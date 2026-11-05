import type * as Monaco from "monaco-editor";
import { translate } from "../i18n/translate";

export interface SqlSnippetDef {
  label: string;
  detail: string;
  /** Translation key of the description shown next to the snippet. */
  documentationKey: string;
  insertText: string;
}

export const SQL_SNIPPETS: SqlSnippetDef[] = [
  {
    label: "sel",
    detail: "SELECT * FROM table",
    documentationKey: "sqlSnippets.docs.sel",
    insertText: "SELECT ${1:*} FROM ${2:table_name};",
  },
  {
    label: "select",
    detail: "SELECT columns FROM table",
    documentationKey: "sqlSnippets.docs.select",
    insertText: "SELECT ${1:*} FROM ${2:table_name};",
  },
  {
    label: "sc",
    detail: "SELECT COUNT(*) FROM table",
    documentationKey: "sqlSnippets.docs.sc",
    insertText: "SELECT COUNT(*) FROM ${1:table_name};",
  },
  {
    label: "from",
    detail: "FROM table_name AS alias",
    documentationKey: "sqlSnippets.docs.from",
    insertText: "FROM ${1:table_name} AS ${2:t1}",
  },
  {
    label: "join",
    detail: "INNER JOIN table ON condition",
    documentationKey: "sqlSnippets.docs.join",
    insertText: "INNER JOIN ${1:table_name} ON ${2:condition}",
  },
  {
    label: "leftjoin",
    detail: "LEFT JOIN table ON condition",
    documentationKey: "sqlSnippets.docs.leftjoin",
    insertText: "LEFT JOIN ${1:table_name} ON ${2:condition}",
  },
  {
    label: "rightjoin",
    detail: "RIGHT JOIN table ON condition",
    documentationKey: "sqlSnippets.docs.rightjoin",
    insertText: "RIGHT JOIN ${1:table_name} ON ${2:condition}",
  },
  {
    label: "where",
    detail: "WHERE condition",
    documentationKey: "sqlSnippets.docs.where",
    insertText: "WHERE ${1:condition}",
  },
  {
    label: "groupby",
    detail: "GROUP BY column",
    documentationKey: "sqlSnippets.docs.groupby",
    insertText: "GROUP BY ${1:column}",
  },
  {
    label: "having",
    detail: "HAVING condition",
    documentationKey: "sqlSnippets.docs.having",
    insertText: "HAVING ${1:condition}",
  },
  {
    label: "orderby",
    detail: "ORDER BY column ASC/DESC",
    documentationKey: "sqlSnippets.docs.orderby",
    insertText: "ORDER BY ${1:column} ${2|ASC,DESC|}",
  },
  {
    label: "limit",
    detail: "LIMIT count OFFSET offset",
    documentationKey: "sqlSnippets.docs.limit",
    insertText: "LIMIT ${1:50} OFFSET ${2:0}",
  },
  {
    label: "ins",
    detail: "INSERT INTO table (cols) VALUES (vals)",
    documentationKey: "sqlSnippets.docs.ins",
    insertText: "INSERT INTO ${1:table_name} (${2:column1, column2})\nVALUES (${3:value1, value2});",
  },
  {
    label: "upd",
    detail: "UPDATE table SET col = val WHERE cond",
    documentationKey: "sqlSnippets.docs.upd",
    insertText: "UPDATE ${1:table_name}\nSET ${2:column} = ${3:value}\nWHERE ${4:condition};",
  },
  {
    label: "del",
    detail: "DELETE FROM table WHERE cond",
    documentationKey: "sqlSnippets.docs.del",
    insertText: "DELETE FROM ${1:table_name}\nWHERE ${2:condition};",
  },
  {
    label: "cte",
    detail: "WITH cte AS (...) SELECT ...",
    documentationKey: "sqlSnippets.docs.cte",
    insertText: "WITH ${1:cte_name} AS (\n  SELECT ${2:*}\n  FROM ${3:source_table}\n  WHERE ${4:condition}\n)\nSELECT *\nFROM ${1:cte_name};",
  },
  {
    label: "case",
    detail: "CASE WHEN ... THEN ... ELSE ... END",
    documentationKey: "sqlSnippets.docs.case",
    insertText: "CASE\n  WHEN ${1:condition} THEN ${2:result}\n  ELSE ${3:default_result}\nEND",
  },
  {
    label: "query",
    detail: "Full SQL Developer Query Flow (SELECT -> FROM -> JOIN -> WHERE -> GROUP -> HAVING -> ORDER -> LIMIT)",
    documentationKey: "sqlSnippets.docs.query",
    insertText: "SELECT\n  ${1:t1.*}\nFROM ${2:table1} AS t1\nLEFT JOIN ${3:table2} AS t2 ON ${4:t2.fk = t1.id}\nWHERE ${5:1=1}\nGROUP BY ${6:t1.id}\nHAVING ${7:COUNT(*) > 0}\nORDER BY ${8:t1.id} DESC\nLIMIT ${9:50} OFFSET ${10:0};",
  },
  {
    label: "fullquery",
    detail: "Full SQL Developer Query Flow (SELECT -> FROM -> WHERE -> GROUP BY -> HAVING -> ORDER BY -> LIMIT)",
    documentationKey: "sqlSnippets.docs.fullquery",
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
      documentation: translate(snippet.documentationKey),
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
