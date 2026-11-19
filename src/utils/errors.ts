/**
 * Safely extracts an error message from an unknown caught value.
 *
 * Handles Error instances, plain strings, and arbitrary types
 * without unsafe casts.
 */
export function toErrorMessage(err: unknown): string {
  let message = "";
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

  if (
    message.includes("expected to read 4 bytes, got 0 bytes at EOF") ||
    message.includes("got 0 bytes at EOF")
  ) {
    return "SSH tunnel was closed or disconnected (EOF). Please try reconnecting.";
  }

  return message;
}
