export interface FkCandidate {
  key: unknown;
  label?: string;
  secondaryLabel?: string;
}

const PRIMARY_LABEL_KEYWORDS = [
  "name",
  "username",
  "display_name",
  "full_name",
  "title",
  "label",
  "code",
  "slug",
];

const SECONDARY_LABEL_KEYWORDS = [
  "email",
  "slug",
  "code",
  "description",
  "subtitle",
  "summary",
  "status",
  "type",
  "role",
];

/**
 * Heuristically finds the most representative human-readable columns from a table schema.
 */
export function detectLabelColumns(
  columns: string[],
  refColumn: string,
): { primaryLabel?: string; secondaryLabel?: string } {
  const otherColumns = columns.filter((col) => col.toLowerCase() !== refColumn.toLowerCase());

  let primaryLabel: string | undefined;
  for (const kw of PRIMARY_LABEL_KEYWORDS) {
    const match = otherColumns.find((c) => c.toLowerCase() === kw || c.toLowerCase().endsWith(`_${kw}`));
    if (match) {
      primaryLabel = match;
      break;
    }
  }

  // If no exact match, look for any column containing 'name' or 'title'
  if (!primaryLabel) {
    primaryLabel = otherColumns.find((c) => {
      const lower = c.toLowerCase();
      return lower.includes("name") || lower.includes("title");
    });
  }

  let secondaryLabel: string | undefined;
  for (const kw of SECONDARY_LABEL_KEYWORDS) {
    const match = otherColumns.find(
      (c) => c !== primaryLabel && (c.toLowerCase() === kw || c.toLowerCase().endsWith(`_${kw}`))
    );
    if (match) {
      secondaryLabel = match;
      break;
    }
  }

  // Fallback: if secondary is still undefined, check if any unused primary keyword matches
  if (!secondaryLabel) {
    for (const kw of PRIMARY_LABEL_KEYWORDS) {
      const match = otherColumns.find(
        (c) => c !== primaryLabel && (c.toLowerCase() === kw || c.toLowerCase().endsWith(`_${kw}`))
      );
      if (match) {
        secondaryLabel = match;
        break;
      }
    }
  }

  return { primaryLabel, secondaryLabel };
}

/**
 * Client-side search filtering across key, primary label, and secondary label.
 */
export function filterFkCandidates(
  candidates: FkCandidate[],
  search: string,
): FkCandidate[] {
  const term = search.trim().toLowerCase();
  if (!term) return candidates;

  return candidates.filter((item) => {
    const keyStr = String(item.key ?? "").toLowerCase();
    if (keyStr.includes(term)) return true;

    if (item.label && item.label.toLowerCase().includes(term)) {
      return true;
    }

    if (item.secondaryLabel && item.secondaryLabel.toLowerCase().includes(term)) {
      return true;
    }

    return false;
  });
}
