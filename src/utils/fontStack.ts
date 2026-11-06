/**
 * Keeps Vietnamese text readable in the UI font.
 *
 * Fonts picked by `system-ui` on some systems (for example Yu Gothic UI on Japanese Windows) lack the
 * precomposed Vietnamese letters with two diacritics, such as e-circumflex-acute or o-circumflex-acute. The text engine then rebuilds them
 * from a base letter plus a combining mark and places the mark badly. Listing "Segoe UI", which ships the
 * full Vietnamese range, before the first generic family means those letters are drawn properly while the
 * rest of the stack still decides how everything else looks.
 */
const GENERIC_FAMILIES = new Set(["system-ui", "ui-sans-serif", "sans-serif", "serif", "-apple-system", "blinkmacsystemfont"]);
const VIETNAMESE_SAFE_FONT = '"Segoe UI"';

const bare = (family: string) => family.trim().replace(/^["']|["']$/g, "").toLowerCase();

/** Inserts "Segoe UI" before the first generic family of a font-family list, unless already present. */
export function withVietnameseSafeFont(stack: string): string {
  const families = stack
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);
  if (families.length === 0 || families.some((f) => bare(f) === "segoe ui")) return stack;

  const index = families.findIndex((f) => GENERIC_FAMILIES.has(bare(f)));
  if (index === -1) return [...families, VIETNAMESE_SAFE_FONT].join(", ");
  return [...families.slice(0, index), VIETNAMESE_SAFE_FONT, ...families.slice(index)].join(", ");
}
