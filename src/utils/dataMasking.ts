/**
 * Utilities for identifying sensitive data columns and masking PII
 * (Personally Identifiable Information) in DataGrid and exports.
 */

export type MaskingProfile = "smart" | "full" | "redacted";

const SENSITIVE_COLUMN_PATTERNS = [
  /password/i,
  /passwd/i,
  /secret/i,
  /token/i,
  /api[_-]?key/i,
  /auth/i,
  /credit[_-]?card/i,
  /card[_-]?num/i,
  /pan/i,
  /cvv/i,
  /cvc/i,
  /ssn/i,
  /social[_-]?security/i,
  /phone/i,
  /mobile/i,
  /tel/i,
  /cell/i,
  /email/i,
  /mail/i,
  /salary/i,
  /wage/i,
  /compensation/i,
  /private[_-]?key/i,
  /cccd/i,
  /cmnd/i,
  /citizen[_-]?id/i,
  /national[_-]?id/i,
  /identity[_-]?card/i,
  /id[_-]?card/i,
  /identity[_-]?num/i,
  /tax[_-]?id/i,
  /mst/i,
  /bank[_-]?acc/i,
  /account[_-]?num/i,
  /iban/i,
  /swift/i,
  // Japanese columns, in kanji/kana and in the romaji often used for physical names.
  /氏名|姓名|電話|携帯|住所|メール|生年月日|誕生日|給与|給料|年収|口座|暗証|パスワード|郵便|マイナンバー|個人番号|カード番号|クレジット/,
  /shimei|denwa|keitai|jusho|seinengappi|tanjobi|kyuyo|kouza|koza|anshou|yubin|mynumber|my_number|kojin[_-]?bango/i,
  // Vietnamese columns, with and without accents or underscores.
  /ho[_-]?ten|h\u1ecd[_ ]?t\u00ean|sdt|so[_-]?dt|dien[_-]?thoai|\u0111i\u1ec7n[_ ]?tho\u1ea1i|dia[_-]?chi|\u0111\u1ecba[_ ]?ch\u1ec9|ngay[_-]?sinh|ng\u00e0y[_ ]?sinh|luong|l\u01b0\u01a1ng|tai[_-]?khoan|t\u00e0i[_ ]?kho\u1ea3n|mat[_-]?khau|m\u1eadt[_ ]?kh\u1ea9u|so[_-]?the/i,
];

/**
 * Checks if a column name indicates sensitive personal, financial, or auth data.
 */
export function isSensitiveColumn(columnName: string, extraColumns: readonly string[] = []): boolean {
  if (!columnName) return false;
  const name = columnName.trim().toLowerCase();
  if (extraColumns.some((extra) => extra !== "" && name.includes(extra))) return true;
  return SENSITIVE_COLUMN_PATTERNS.some((pattern) => pattern.test(name));
}

/**
 * Parses the "extra columns to mask" setting: names or fragments separated by commas, semicolons or new lines.
 * Matching is a case-insensitive "contains", so `kh_dt` also covers `kh_dt_2`. Blank entries are dropped.
 */
export function parseExtraMaskedColumns(text: string | null | undefined): string[] {
  if (!text) return [];
  const seen = new Set<string>();
  for (const part of text.split(/[,;\n]/)) {
    const name = part.trim().toLowerCase();
    if (name) seen.add(name);
  }
  return [...seen];
}

/**
 * Masks an email address:
 * - smart: "alexander@example.com" -> "al***@example.com"
 * - full: "••••••••"
 * - redacted: "[REDACTED EMAIL]"
 */
export function maskEmail(email: string, profile: MaskingProfile = "smart"): string {
  if (profile === "redacted") return "[REDACTED EMAIL]";
  if (profile === "full") return "••••••••";

  const atIndex = email.indexOf("@");
  if (atIndex <= 0) {
    return "••••••••";
  }
  const username = email.slice(0, atIndex);
  const domain = email.slice(atIndex);

  if (username.length <= 2) {
    return `${username[0]}***${domain}`;
  }
  return `${username.slice(0, 2)}***${domain}`;
}

/**
 * Masks a phone number:
 * - smart: "0901234567" -> "090*****67"
 * - full: "••••••••"
 * - redacted: "[REDACTED PHONE]"
 */
export function maskPhone(phone: string, profile: MaskingProfile = "smart"): string {
  if (profile === "redacted") return "[REDACTED PHONE]";
  if (profile === "full") return "••••••••";

  const digits = phone.trim();
  if (digits.length <= 4) {
    return "••••";
  }
  const start = digits.slice(0, 3);
  const end = digits.slice(-2);
  return `${start}*****${end}`;
}

/**
 * Masks Citizen Identity / CCCD / CMND / National ID:
 * - smart: "001234567890" -> "001******890"
 * - full: "••••••••••••"
 * - redacted: "[REDACTED CCCD]"
 */
export function maskCitizenId(id: string, profile: MaskingProfile = "smart"): string {
  if (profile === "redacted") return "[REDACTED ID]";
  if (profile === "full") return "••••••••••••";

  const clean = id.trim();
  if (clean.length <= 6) {
    return "••••••••";
  }
  const prefix = clean.slice(0, 3);
  const suffix = clean.slice(-3);
  return `${prefix}******${suffix}`;
}

/**
 * Masks Credit Card / Debit Card number:
 * - smart: "4532123456789012" -> "•••• •••• •••• 9012"
 * - full: "•••• •••• •••• ••••"
 * - redacted: "[REDACTED CARD]"
 */
export function maskCreditCard(card: string, profile: MaskingProfile = "smart"): string {
  if (profile === "redacted") return "[REDACTED CARD]";
  if (profile === "full") return "•••• •••• •••• ••••";

  const clean = card.replace(/\s+/g, "");
  if (clean.length < 8) {
    return "••••••••";
  }
  const last4 = clean.slice(-4);
  return `•••• •••• •••• ${last4}`;
}

/**
 * Masks Bank Account number:
 * - smart: "190367890123" -> "190*****0123"
 * - full: "••••••••••••"
 * - redacted: "[REDACTED ACCOUNT]"
 */
export function maskBankAccount(account: string, profile: MaskingProfile = "smart"): string {
  if (profile === "redacted") return "[REDACTED ACCOUNT]";
  if (profile === "full") return "••••••••••••";

  const clean = account.trim();
  if (clean.length <= 6) {
    return "••••••••";
  }
  const prefix = clean.slice(0, 3);
  const suffix = clean.slice(-4);
  return `${prefix}*****${suffix}`;
}

/**
 * Masks a general sensitive string value depending on inferred pattern and profile.
 */
export function maskSensitiveValue(
  value: unknown,
  columnName?: string,
  profile: MaskingProfile = "smart",
): string {
  if (value === null || value === undefined) {
    return "NULL";
  }

  const str = typeof value === "object" ? JSON.stringify(value) : String(value);
  if (!str.trim()) {
    return str;
  }

  if (profile === "redacted") {
    return "[REDACTED]";
  }
  if (profile === "full") {
    return "••••••••";
  }

  const name = (columnName ?? "").toLowerCase();

  // CCCD / CMND / National ID
  if (
    name.includes("cccd") ||
    name.includes("cmnd") ||
    name.includes("citizen") ||
    name.includes("national_id") ||
    name.includes("id_card") ||
    name.includes("tax_id") ||
    name.includes("mst")
  ) {
    return maskCitizenId(str, profile);
  }

  // Credit Card / Debit Card / PAN
  if (
    name.includes("credit") ||
    name.includes("card_num") ||
    name.includes("card_no") ||
    name.includes("cardnumber") ||
    name.includes("pan")
  ) {
    return maskCreditCard(str, profile);
  }

  // Bank Account / IBAN
  if (
    name.includes("bank_acc") ||
    name.includes("account_num") ||
    name.includes("account_no") ||
    name.includes("acc_no") ||
    name.includes("iban")
  ) {
    return maskBankAccount(str, profile);
  }

  // Email
  if (name.includes("email") || name.includes("mail") || (str.includes("@") && str.includes("."))) {
    return maskEmail(str, profile);
  }

  // Phone / mobile / tel
  if (name.includes("phone") || name.includes("mobile") || name.includes("tel") || name.includes("cell")) {
    return maskPhone(str, profile);
  }

  // Salary / wage / amount
  if (name.includes("salary") || name.includes("wage") || name.includes("compensation")) {
    return "***,***";
  }

  // Default secret / token / password / SSN masking
  return "••••••••";
}

/**
 * Copy of `rows` (arrays in the order of `columns`) with the values of sensitive columns masked. Other values
 * and untouched rows keep their identity, so the result is cheap to build and safe to hand to a copy/export formatter.
 */
export function maskRows(
  rows: readonly (readonly unknown[])[],
  columns: readonly string[],
  profile: MaskingProfile = "smart",
  extraColumns: readonly string[] = [],
): unknown[][] {
  const sensitive = columns.map((name) => isSensitiveColumn(name, extraColumns));
  if (!sensitive.some(Boolean)) return rows.map((row) => [...row]);
  return rows.map((row) =>
    row.map((value, index) =>
      sensitive[index] ? maskSensitiveValue(value, columns[index], profile) : value,
    ),
  );
}

/** Like `maskRows` for one record keyed by column name (the row editor). */
export function maskRecord(
  record: Readonly<Record<string, unknown>>,
  profile: MaskingProfile = "smart",
  extraColumns: readonly string[] = [],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(record)) {
    result[name] = isSensitiveColumn(name, extraColumns) ? maskSensitiveValue(value, name, profile) : value;
  }
  return result;
}

/** What replaces a masked SQL literal. */
const SQL_LITERAL_MASK = "•••";

/**
 * Hides the values in a SQL statement: string literals (`'a@b.com'`, `$$...$$`) and long numbers (phone
 * and account numbers) become `•••`, while keywords, names, identifiers in "double quotes" or `backticks`, and
 * comments stay. Used where queries are shown to an audience (history). It leans towards hiding too much:
 * an unterminated or oddly escaped string is masked up to the end of the statement.
 */
export function maskSqlLiterals(sql: string): string {
  let out = "";
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (ch === "-" && next === "-") {
      const end = sql.indexOf("\n", i);
      const stop = end === -1 ? n : end;
      out += sql.slice(i, stop);
      i = stop;
    } else if (ch === "/" && next === "*") {
      const end = sql.indexOf("*/", i + 2);
      const stop = end === -1 ? n : end + 2;
      out += sql.slice(i, stop);
      i = stop;
    } else if (ch === "'") {
      i += 1;
      while (i < n) {
        if (sql[i] === "\\") i += 2;
        else if (sql[i] === "'" && sql[i + 1] === "'") i += 2;
        else if (sql[i] === "'") break;
        else i += 1;
      }
      i = Math.min(i + 1, n);
      out += `'${SQL_LITERAL_MASK}'`;
    } else if (ch === "$" && /^\$[A-Za-z_]*\$/.test(sql.slice(i))) {
      const tag = /^\$[A-Za-z_]*\$/.exec(sql.slice(i))![0];
      const end = sql.indexOf(tag, i + tag.length);
      i = end === -1 ? n : end + tag.length;
      out += `${tag}${SQL_LITERAL_MASK}${tag}`;
    } else if (ch === '"' || ch === "`") {
      const end = sql.indexOf(ch, i + 1);
      const stop = end === -1 ? n : end + 1;
      out += sql.slice(i, stop);
      i = stop;
    } else if (/[0-9]/.test(ch) && !/[A-Za-z0-9_]/.test(sql[i - 1] ?? "")) {
      let j = i;
      while (j < n && /[0-9]/.test(sql[j])) j += 1;
      const digits = j - i;
      // Keep short numbers (LIMIT 10, ids); hide long ones that look like phone, account or card numbers.
      out += digits >= 6 ? SQL_LITERAL_MASK : sql.slice(i, j);
      i = j;
    } else {
      out += ch;
      i += 1;
    }
  }
  return out;
}
