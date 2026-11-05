import { translate } from "../i18n/translate";

export type SafetyDangerType =
  | "drop"
  | "truncate"
  | "delete_no_where"
  | "update_no_where"
  | "production_target";

export type SafeModeLevel = "silent" | "alert" | "strict" | "readonly";

export interface SqlSafetyCheckResult {
  isDangerous: boolean;
  dangerTypes: SafetyDangerType[];
  reasons: string[];
  isProduction: boolean;
}

export interface SafeModeCheckResult {
  allowed: boolean;
  requiresConfirmation: boolean;
  reason?: string;
}

/**
 * Resolves effective Safe Mode level, falling back to environment presets if not explicitly configured.
 */
export function resolveSafeModeLevel(
  safeMode?: SafeModeLevel | null,
  environment?: string | null,
): SafeModeLevel {
  if (safeMode) return safeMode;
  const env = environment?.toLowerCase();
  if (env === "production") return "strict";
  if (env === "staging") return "alert";
  return "silent";
}

/** The connection fields that decide which Safe Mode level applies. */
export interface SafeModeSource {
  safe_mode?: SafeModeLevel | null;
  environment?: string | null;
  appearance?: { safeMode?: SafeModeLevel | null; environment?: string | null } | null;
}

/**
 * Effective Safe Mode level for a saved connection. The level picked in the connection
 * dialog lives in `appearance.safeMode`; without an explicit choice the environment
 * (production/staging) decides the default.
 */
export function resolveConnectionSafeMode(conn: SafeModeSource | null | undefined): SafeModeLevel {
  return resolveSafeModeLevel(
    conn?.appearance?.safeMode ?? conn?.safe_mode,
    conn?.environment ?? conn?.appearance?.environment,
  );
}

/**
 * Strips comments and string literals from SQL text to allow safe lexical inspection.
 */
export function stripCommentsAndLiterals(sql: string): string {
  let result = "";
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inLineComment = false;
  let inBlockComment = false;
  const len = sql.length;

  for (let i = 0; i < len; i++) {
    const ch = sql[i];
    const next = i + 1 < len ? sql[i + 1] : "";

    if (inLineComment) {
      if (ch === "\n" || ch === "\r") {
        inLineComment = false;
        result += ch;
      }
      continue;
    }

    if (inBlockComment) {
      if (ch === "*" && next === "/") {
        inBlockComment = false;
        i++; // skip /
      }
      continue;
    }

    if (inSingleQuote) {
      if (ch === "'") {
        if (next === "'") {
          // Escaped single quote
          i++;
        } else {
          inSingleQuote = false;
        }
      }
      continue;
    }

    if (inDoubleQuote) {
      if (ch === '"') {
        inDoubleQuote = false;
      }
      continue;
    }

    // Check comment starters
    if (ch === "-" && next === "-") {
      inLineComment = true;
      i++;
      continue;
    }
    if (ch === "/" && next === "*") {
      inBlockComment = true;
      i++;
      continue;
    }

    // Check string starters
    if (ch === "'") {
      inSingleQuote = true;
      continue;
    }
    if (ch === '"') {
      inDoubleQuote = true;
      continue;
    }

    result += ch;
  }

  return result;
}

/**
 * Returns true if the query statement mutates data or table/schema structure.
 */
export function isWriteQuery(sql: string): boolean {
  const cleaned = stripCommentsAndLiterals(sql);
  return /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|RENAME|REPLACE)\b/i.test(cleaned);
}

/**
 * Inspects a query string for destructive patterns and production guardrails.
 */
export function checkSqlSafety(
  sql: string,
  environment?: string,
): SqlSafetyCheckResult {
  const isProduction = environment?.toLowerCase() === "production";
  const cleaned = stripCommentsAndLiterals(sql);

  // Split multiple queries by semicolon
  const statements = cleaned
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const dangerTypes: SafetyDangerType[] = [];
  const reasons: string[] = [];

  for (const stmt of statements) {
    // 1. DROP statement
    if (/\bDROP\s+(TABLE|DATABASE|SCHEMA|VIEW|INDEX)\b/i.test(stmt)) {
      if (!dangerTypes.includes("drop")) {
        dangerTypes.push("drop");
        reasons.push(translate("safety.reasons.drop"));
      }
    }

    // 2. TRUNCATE statement
    if (/\bTRUNCATE(\s+TABLE)?\b/i.test(stmt)) {
      if (!dangerTypes.includes("truncate")) {
        dangerTypes.push("truncate");
        reasons.push(translate("safety.reasons.truncate"));
      }
    }

    // 3. DELETE without WHERE
    if (/\bDELETE\s+FROM\b/i.test(stmt)) {
      if (!/\bWHERE\b/i.test(stmt)) {
        if (!dangerTypes.includes("delete_no_where")) {
          dangerTypes.push("delete_no_where");
          reasons.push(translate("safety.reasons.deleteNoWhere"));
        }
      }
    }

    // 4. UPDATE without WHERE
    if (/\bUPDATE\s+[^\s]+\s+SET\b/i.test(stmt)) {
      if (!/\bWHERE\b/i.test(stmt)) {
        if (!dangerTypes.includes("update_no_where")) {
          dangerTypes.push("update_no_where");
          reasons.push(translate("safety.reasons.updateNoWhere"));
        }
      }
    }
  }

  // If connected to Production, flag it
  if (isProduction) {
    if (dangerTypes.length > 0 || /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE)\b/i.test(cleaned)) {
      dangerTypes.push("production_target");
      reasons.push(translate("safety.reasons.production"));
    }
  }

  return {
    isDangerous: dangerTypes.length > 0,
    dangerTypes,
    reasons,
    isProduction,
  };
}

/**
 * Evaluates whether a query is allowed or requires user confirmation under the connection's Safe Mode level.
 */
export function evaluateSafeMode(
  sql: string,
  level: SafeModeLevel,
  connectionName?: string,
): SafeModeCheckResult {
  const nameSuffix = connectionName ? translate("safety.onConnection", { name: connectionName }) : "";

  // 1. READONLY: Block any write operations immediately
  if (level === "readonly") {
    if (isWriteQuery(sql)) {
      return {
        allowed: false,
        requiresConfirmation: false,
        reason: translate("safety.readonlyBlocked", { suffix: nameSuffix }),
      };
    }
    return { allowed: true, requiresConfirmation: false };
  }

  // 2. STRICT: Require explicit confirmation for any write or DDL operations
  if (level === "strict") {
    if (isWriteQuery(sql)) {
      const safety = checkSqlSafety(sql, "production");
      const reasonsText = safety.reasons.length > 0 ? `\n• ${safety.reasons.join("\n• ")}` : "";
      return {
        allowed: true,
        requiresConfirmation: true,
        reason: translate("safety.strictConfirm", { suffix: nameSuffix, reasons: reasonsText }),
      };
    }
    return { allowed: true, requiresConfirmation: false };
  }

  // 3. ALERT: Warn only on high-risk operations (DROP, TRUNCATE, DELETE/UPDATE without WHERE)
  if (level === "alert") {
    const safety = checkSqlSafety(sql);
    if (safety.isDangerous) {
      return {
        allowed: true,
        requiresConfirmation: true,
        reason: translate("safety.alertConfirm", { suffix: nameSuffix, reasons: safety.reasons.join("\n• ") }),
      };
    }
    return { allowed: true, requiresConfirmation: false };
  }

  // 4. SILENT: Execute freely
  return { allowed: true, requiresConfirmation: false };
}
