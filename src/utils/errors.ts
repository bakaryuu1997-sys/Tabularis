import { translate } from "../i18n/translate";

/**
 * Stable codes the backend prefixes to a dropped-transport error (EOF, reset,
 * broken pipe), mapped to translation keys and English fallbacks.
 */
const CONNECTION_RESET_MESSAGES: ReadonlyArray<{ code: string; key: string; fallback: string }> = [
  {
    code: "ERR_SSH_CONNECTION_RESET",
    key: "connectionErrors.sshConnectionReset",
    fallback: "SSH tunnel connection was reset. Please run the query again.",
  },
  {
    code: "ERR_CONNECTION_RESET",
    key: "connectionErrors.connectionReset",
    fallback: "Connection was reset. Please run the query again.",
  },
];

/**
 * Safely extracts an error message from an unknown caught value.
 *
 * Handles Error instances, plain strings, and arbitrary types
 * without unsafe casts.
 */
export function toErrorMessage(err: unknown): string {
  let message: string;
  if (typeof err === "string") {
    message = err;
  } else if (err instanceof Error) {
    message = err.message;
  } else if (
    typeof err === "object" &&
    err !== null &&
    "message" in err &&
    typeof (err as Record<string, unknown>).message === "string"
  ) {
    // Tauri invoke errors are often serialised as plain objects with a message field
    message = (err as Record<string, unknown>).message as string;
  } else {
    message = String(err);
  }

  // The code may arrive wrapped ("Query failed: ERR_…"), so search for it.
  const reset = CONNECTION_RESET_MESSAGES.find(({ code }) => message.includes(code));
  if (reset) {
    const translated = translate(reset.key);
    return translated === reset.key ? reset.fallback : translated;
  }

  return message;
}
