/**
 * Utilities for identifying sensitive data columns and masking PII
 * (Personally Identifiable Information) in DataGrid and exports.
 */

const SENSITIVE_COLUMN_PATTERNS = [
  /password/i,
  /passwd/i,
  /secret/i,
  /token/i,
  /api[_-]?key/i,
  /auth/i,
  /credit[_-]?card/i,
  /card[_-]?num/i,
  /cvv/i,
  /ssn/i,
  /social[_-]?security/i,
  /phone/i,
  /mobile/i,
  /tel/i,
  /email/i,
  /salary/i,
  /wage/i,
  /private[_-]?key/i,
];

/**
 * Checks if a column name indicates sensitive personal, financial, or auth data.
 */
export function isSensitiveColumn(columnName: string): boolean {
  if (!columnName) return false;
  const name = columnName.trim().toLowerCase();
  return SENSITIVE_COLUMN_PATTERNS.some((pattern) => pattern.test(name));
}

/**
 * Masks an email address: e.g. "alexander@example.com" -> "al***@example.com"
 */
export function maskEmail(email: string): string {
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
 * Masks a phone number: e.g. "0901234567" -> "090*****67"
 */
export function maskPhone(phone: string): string {
  const digits = phone.trim();
  if (digits.length <= 4) {
    return "••••";
  }
  const start = digits.slice(0, 3);
  const end = digits.slice(-2);
  return `${start}*****${end}`;
}

/**
 * Masks a general sensitive string value depending on inferred pattern.
 */
export function maskSensitiveValue(value: unknown, columnName?: string): string {
  if (value === null || value === undefined) {
    return "NULL";
  }

  const str = typeof value === "object" ? JSON.stringify(value) : String(value);
  if (!str.trim()) {
    return str;
  }

  const name = (columnName ?? "").toLowerCase();

  // If email
  if (name.includes("email") || (str.includes("@") && str.includes("."))) {
    return maskEmail(str);
  }

  // If phone / mobile / tel
  if (name.includes("phone") || name.includes("mobile") || name.includes("tel")) {
    return maskPhone(str);
  }

  // If salary / wage / amount
  if (name.includes("salary") || name.includes("wage")) {
    return "***,***";
  }

  // Default secret / token / password / SSN masking
  return "••••••••";
}
