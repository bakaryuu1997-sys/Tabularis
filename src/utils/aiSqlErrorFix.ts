import { translate } from "../i18n/translate";

/** Clean and normalize error text for AI prompt injection. */
export function formatSqlErrorForAi(error: string): string {
  const trimmed = error.trim();
  return trimmed.length > 0 ? trimmed : "Unknown error";
}

/**
 * Build a structured prompt asking the AI to diagnose and fix a failed SQL statement.
 */
export function buildSqlErrorPrompt(query: string, error: string): string {
  const cleanError = formatSqlErrorForAi(error);
  const cleanQuery = query.trim();

  return translate("aiPrompts.fixSqlError", { query: cleanQuery, error: cleanError });
}
