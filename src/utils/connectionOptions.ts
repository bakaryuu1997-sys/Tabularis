import type { DriverCapabilities } from "../types/plugins";

/** Default SQL that opens a transaction when a driver does not declare `begin_transaction_sql`. */
export const DEFAULT_BEGIN_TRANSACTION_SQL = "START TRANSACTION;";

/** Generic SSL mode list used when a driver does not declare `ssl_modes`. */
export const GENERIC_SSL_MODES: readonly string[] = [
  "disabled",
  "preferred",
  "required",
  "verify_ca",
  "verify_identity",
];

/** SQL statement that opens a transaction on this driver. */
export function beginTransactionSql(
  capabilities: Pick<DriverCapabilities, "begin_transaction_sql"> | null | undefined,
): string {
  return capabilities?.begin_transaction_sql?.trim() || DEFAULT_BEGIN_TRANSACTION_SQL;
}

export interface SslModeOptions {
  /** Modes in display order. */
  modes: string[];
  /** Mode preselected for a new connection. */
  defaultMode: string;
}

/**
 * SSL modes a driver offers and the one preselected. A declared `default_ssl_mode` wins when it is one of
 * the modes; otherwise `required` is used when offered, else the first mode.
 */
export function resolveSslModes(
  capabilities: Pick<DriverCapabilities, "ssl_modes" | "default_ssl_mode"> | null | undefined,
): SslModeOptions {
  const declared = capabilities?.ssl_modes?.filter((m) => m.trim() !== "") ?? [];
  const modes = declared.length > 0 ? declared : [...GENERIC_SSL_MODES];
  const wanted = capabilities?.default_ssl_mode;
  const defaultMode =
    wanted && modes.includes(wanted)
      ? wanted
      : modes.includes("required")
        ? "required"
        : modes[0];
  return { modes, defaultMode };
}

/** True for the "no TLS" modes of the built-in drivers (`disable` for PostgreSQL, `disabled` for MySQL). */
export function isSslDisabledMode(mode: string | null | undefined): boolean {
  return mode === "disable" || mode === "disabled";
}

/** Readable fallback label for a mode that has no translation (e.g. `verify-ca` → `Verify CA`). */
export function defaultSslModeLabel(mode: string): string {
  return mode
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => (word.toLowerCase() === "ca" ? "CA" : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(" ");
}
