import type { ExplainNode, ExplainPlan } from "../types/explain";

/**
 * Index advisor helpers.
 *
 * Everything here is derived from a plan the database planner actually produced.
 * Nothing is simulated: cost figures for a "with index" plan must come from a
 * what-if EXPLAIN executed by the backend (see `explain_query_what_if`).
 */

/** Full scans cheaper than this (planner cost units) are not worth indexing. */
export const MIN_SCAN_COST_FOR_SUGGESTION = 100;

/** Composite index suggestions are capped at this many columns. */
export const MAX_SUGGESTED_INDEX_COLUMNS = 3;

/** PostgreSQL's identifier limit; also a safe ceiling for the other engines. */
const MAX_INDEX_NAME_LENGTH = 63;

export interface IndexCandidate {
  tableName: string;
  /** Equality columns first, then range columns. */
  columns: string[];
  indexName: string;
  /** Planner cost of the scan node that motivated this suggestion. */
  scanCost: number;
}

export interface FilterColumnGroups {
  equality: string[];
  range: string[];
}

export interface WhatIfComparison {
  beforeCost: number | null;
  afterCost: number | null;
  /** Percent reduction of the plan's total planner cost, null when unknown. */
  costReductionPercent: number | null;
  /** beforeCost / afterCost in planner cost units. This is NOT wall-clock speedup. */
  costRatio: number | null;
  /** Tables whose full scan disappeared once the hypothetical indexes existed. */
  resolvedTables: string[];
}

const RESERVED_WORDS = new Set([
  "and", "or", "not", "case", "when", "then", "else", "end", "where", "select",
  "null", "true", "false", "any", "all", "some", "array", "like", "ilike", "in", "is",
]);

const FILTER_TOKEN =
  /("(?:[^"]|"")+"|[A-Za-z_][A-Za-z0-9_$]*)\s*(<=|>=|<>|!=|=|<|>|~~\*|~~|\bILIKE\b|\bLIKE\b|\bIN\b|\bIS\b)/gi;

function unquoteIdentifier(token: string): string {
  return token.startsWith('"') ? token.slice(1, -1).replace(/""/g, '"') : token;
}

/**
 * Removes string literals and type casts so only identifiers and operators remain,
 * and unwraps `(column)` left behind by casts such as `((status)::text = 'x')`.
 * A parenthesis directly after a word character is a function call and is kept,
 * so `lower(email)` is never mistaken for a plain column.
 */
function stripLiteralsAndCasts(filter: string): string {
  const withoutCasts = filter
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/::[A-Za-z_][A-Za-z0-9_]*(?:\s+(?:with|without)\s+time\s+zone|\s+varying)?(?:\(\d+(?:,\s*\d+)?\))?(?:\[\])?/gi, "");
  return withoutCasts.replace(
    /\(\s*("(?:[^"]|"")+"|[A-Za-z_][A-Za-z0-9_$]*)\s*\)/g,
    (match, token: string, offset: number) =>
      offset > 0 && /[\w$"]/.test(withoutCasts[offset - 1]) ? match : token,
  );
}

/**
 * Extracts the columns a filter compares, split into equality and range predicates.
 * Case is preserved for quoted identifiers; expressions such as `lower(email)` are ignored.
 */
export function extractFilterColumnGroups(filter: string | null | undefined): FilterColumnGroups {
  const groups: FilterColumnGroups = { equality: [], range: [] };
  if (!filter) return groups;

  const cleaned = stripLiteralsAndCasts(filter);
  FILTER_TOKEN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = FILTER_TOKEN.exec(cleaned)) !== null) {
    const rawToken = match[1];
    const column = unquoteIdentifier(rawToken);
    if (!rawToken.startsWith('"') && RESERVED_WORDS.has(column.toLowerCase())) continue;
    const operator = match[2].toUpperCase();
    const isEquality = operator === "=" || operator === "IN" || operator === "IS";
    const target = isEquality ? groups.equality : groups.range;
    if (!groups.equality.includes(column) && !groups.range.includes(column)) {
      target.push(column);
    }
  }
  return groups;
}

/** Flat list of filter columns (equality first). Kept for callers that only need names. */
export function extractFilterColumns(filter: string | null | undefined): string[] {
  const { equality, range } = extractFilterColumnGroups(filter);
  return [...equality, ...range];
}

/** True for node types that read a whole table, in any engine's wording. */
export function isFullScanNode(nodeType: string): boolean {
  return /\b(seq(?:uential)? scan|full (?:table )?scan|table scan|table access full)\b/i.test(nodeType);
}

function walk(node: ExplainNode, visit: (n: ExplainNode) => void): void {
  visit(node);
  for (const child of node.children) walk(child, visit);
}

/** Builds a deterministic index name, truncated to the identifier limit. */
export function buildIndexName(tableName: string, columns: string[]): string {
  const safe = (s: string) => s.replace(/[^A-Za-z0-9_]/g, "_");
  return `idx_${safe(tableName)}_${columns.map(safe).join("_")}`.slice(0, MAX_INDEX_NAME_LENGTH);
}

/**
 * Finds filtered full scans in a real plan and proposes an index for each.
 * A scan with no usable filter column is skipped instead of guessing a column.
 */
export function findIndexCandidates(plan: ExplainPlan): IndexCandidate[] {
  const candidates: IndexCandidate[] = [];
  const seen = new Set<string>();

  walk(plan.root, (node) => {
    if (!node.relation || !isFullScanNode(node.node_type)) return;
    const scanCost = node.total_cost ?? 0;
    if (scanCost < MIN_SCAN_COST_FOR_SUGGESTION) return;

    const columns = extractFilterColumns(node.filter).slice(0, MAX_SUGGESTED_INDEX_COLUMNS);
    if (columns.length === 0) return;

    const key = `${node.relation}\u0000${columns.join("\u0000")}`;
    if (seen.has(key)) return;
    seen.add(key);

    candidates.push({
      tableName: node.relation,
      columns,
      indexName: buildIndexName(node.relation, columns),
      scanCost,
    });
  });

  return candidates;
}

function hasFullScanOn(plan: ExplainPlan, table: string): boolean {
  let found = false;
  walk(plan.root, (n) => {
    if (n.relation === table && isFullScanNode(n.node_type)) found = true;
  });
  return found;
}

/** Compares the original plan with the planner's plan using hypothetical indexes. */
export function compareWhatIf(
  before: ExplainPlan,
  after: ExplainPlan,
  candidates: IndexCandidate[],
): WhatIfComparison {
  const beforeCost = before.root.total_cost;
  const afterCost = after.root.total_cost;

  let costReductionPercent: number | null = null;
  let costRatio: number | null = null;
  if (beforeCost != null && afterCost != null && beforeCost > 0) {
    costReductionPercent = Math.max(0, Math.round(((beforeCost - afterCost) / beforeCost) * 1000) / 10);
    if (afterCost > 0) costRatio = Math.round((beforeCost / afterCost) * 10) / 10;
  }

  const tables = [...new Set(candidates.map((c) => c.tableName))];
  const resolvedTables = tables.filter((t) => hasFullScanOn(before, t) && !hasFullScanOn(after, t));

  return { beforeCost, afterCost, costReductionPercent, costRatio, resolvedTables };
}
