/** Determine if a tab of given type can be renamed by the user. */
export function canRenameTab(type: string): boolean {
  return type === "console" || type === "notebook";
}

/** Sanitize tab title with optional fallback when blank. */
export function sanitizeTabTitle(
  title: string,
  fallback: string = "Console",
): string {
  const trimmed = title.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 100) : fallback;
}

/** Validate whether a new tab title is permitted. */
export function validateTabTitle(title: string): {
  valid: boolean;
  error?: string;
} {
  const trimmed = title.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: "Tab title cannot be empty" };
  }
  if (trimmed.length > 100) {
    return { valid: false, error: "Tab title cannot exceed 100 characters" };
  }
  return { valid: true };
}
