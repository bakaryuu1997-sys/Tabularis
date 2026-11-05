import i18n from "i18next";

/**
 * Translates a key from non-React code (utilities, Monaco providers, validators).
 * Resolves against the active language at call time, falls back to the key itself when i18n is not
 * initialised (for example in isolated unit tests), and never throws.
 */
export function translate(key: string, options?: Record<string, unknown>): string {
  const result = i18n.t(key, options);
  return typeof result === "string" && result.length > 0 ? result : key;
}
