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
