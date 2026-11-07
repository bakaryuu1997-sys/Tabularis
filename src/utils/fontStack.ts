/**
 * Keeps Vietnamese text readable in the UI font across all platforms, especially Japanese Windows.
 *
 * Fonts picked by `system-ui` on some systems (for example Yu Gothic UI on Japanese Windows) lack the
 * precomposed Vietnamese letters with two diacritics, such as e-circumflex-acute (ế), o-circumflex-acute (ố),
 * a-circumflex-tilde (ẫ), etc. The text engine then decomposes them into a base letter plus a combining mark
 * and draws the mark as a floating separate character (' or ~), resulting in text like "kế't nô'i", "dã~n".
 *
 * Moving "Segoe UI" before generic families (system-ui, -apple-system, sans-serif) ensures Windows DirectWrite
 * uses Segoe UI's complete Vietnamese glyph set for Vietnamese/Latin text, while still smoothly falling back
 * to system fonts for Japanese Kanji/Kana or other scripts.
 */
const GENERIC_FAMILIES = new Set([
  "system-ui",
  "ui-sans-serif",
  "sans-serif",
  "serif",
  "-apple-system",
  "blinkmacsystemfont",
]);
const VIETNAMESE_SAFE_FONT = '"Segoe UI"';

const bare = (family: string) => family.trim().replace(/^["']|["']$/g, "").toLowerCase();

/**
 * Ensures "Segoe UI" is placed BEFORE any generic family in the font-family stack.
 * If "Segoe UI" was already in the stack after a generic family (e.g. system-ui),
 * it is moved before the first generic family.
 */
export function withVietnameseSafeFont(stack: string): string {
  const families = stack
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);
  if (families.length === 0) return stack;

  // Filter out any existing Segoe UI entry so we reposition it safely before generic families
  const filtered = families.filter((f) => bare(f) !== "segoe ui");

  const firstGenericIndex = filtered.findIndex((f) => GENERIC_FAMILIES.has(bare(f)));

  if (firstGenericIndex === -1) {
    // No generic family found; append Segoe UI at the end
    return [...filtered, VIETNAMESE_SAFE_FONT].join(", ");
  }

  // Insert Segoe UI right before the first generic family
  return [
    ...filtered.slice(0, firstGenericIndex),
    VIETNAMESE_SAFE_FONT,
    ...filtered.slice(firstGenericIndex),
  ].join(", ");
}
