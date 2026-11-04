import { describe, it, expect } from "vitest";
import {
  buildIndexName,
  compareWhatIf,
  extractFilterColumnGroups,
  extractFilterColumns,
  findIndexCandidates,
  isFullScanNode,
  MIN_SCAN_COST_FOR_SUGGESTION,
} from "../../src/utils/aiExplainDiff";
import type { ExplainNode, ExplainPlan } from "../../src/types/explain";

function node(overrides: Partial<ExplainNode> = {}): ExplainNode {
  return {
    id: "n",
    node_type: "Result",
    relation: null,
    startup_cost: 0,
    total_cost: 0,
    plan_rows: null,
    actual_rows: null,
    actual_time_ms: null,
    actual_loops: null,
    buffers_hit: null,
    buffers_read: null,
    filter: null,
    index_condition: null,
    join_type: null,
    hash_condition: null,
    extra: {},
    children: [],
    ...overrides,
  };
}

function plan(root: ExplainNode): ExplainPlan {
  return {
    root,
    planning_time_ms: null,
    execution_time_ms: null,
    original_query: "SELECT 1",
    driver: "any",
    has_analyze_data: false,
    raw_output: null,
  };
}

const seqScan = (overrides: Partial<ExplainNode> = {}) =>
  node({
    node_type: "Seq Scan",
    relation: "orders",
    total_cost: 1200,
    filter: "(user_id = 42)",
    ...overrides,
  });

describe("extractFilterColumnGroups", () => {
  it("splits equality and range predicates", () => {
    const groups = extractFilterColumnGroups(
      "((created_at > '2026-01-01'::date) AND (status = 'active'::text) AND (user_id = 7))",
    );
    expect(groups.equality).toEqual(["status", "user_id"]);
    expect(groups.range).toEqual(["created_at"]);
  });

  it("ignores operators that only appear inside string literals", () => {
    expect(extractFilterColumns("(name = 'a = b AND c > 1')")).toEqual(["name"]);
  });

  it("ignores type casts instead of treating them as columns", () => {
    expect(extractFilterColumns("((status)::text = 'x'::text)")).toEqual(["status"]);
    expect(extractFilterColumns("(ts > now()::timestamp without time zone)")).toEqual(["ts"]);
  });

  it("keeps the case of quoted identifiers and unwraps them", () => {
    expect(extractFilterColumns('("UserId" = 1)')).toEqual(["UserId"]);
  });

  it("skips expressions such as lower(email)", () => {
    expect(extractFilterColumns("(lower(email) = 'a')")).toEqual([]);
  });

  it("does not report a column twice", () => {
    expect(extractFilterColumns("((a = 1) OR (a = 2))")).toEqual(["a"]);
  });

  it("handles empty input", () => {
    expect(extractFilterColumns(null)).toEqual([]);
    expect(extractFilterColumns("")).toEqual([]);
  });
});

describe("isFullScanNode", () => {
  it.each(["Seq Scan", "Sequential Scan", "Full Table Scan", "Table Scan", "TABLE ACCESS FULL"])(
    "recognises %s",
    (type) => expect(isFullScanNode(type)).toBe(true),
  );
  it.each(["Index Scan", "Index Only Scan", "Bitmap Heap Scan", "Hash Join"])(
    "does not treat %s as a full scan",
    (type) => expect(isFullScanNode(type)).toBe(false),
  );
});

describe("buildIndexName", () => {
  it("sanitises and truncates to 63 characters", () => {
    expect(buildIndexName("my table", ["a-b"])).toBe("idx_my_table_a_b");
    expect(buildIndexName("t".repeat(80), ["c"])).toHaveLength(63);
  });
});

describe("findIndexCandidates", () => {
  it("proposes an index for an expensive filtered full scan", () => {
    const candidates = findIndexCandidates(plan(seqScan()));
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      tableName: "orders",
      columns: ["user_id"],
      indexName: "idx_orders_user_id",
      scanCost: 1200,
    });
  });

  it("puts equality columns before range columns and caps the width", () => {
    const candidates = findIndexCandidates(
      plan(seqScan({ filter: "((a > 1) AND (b = 2) AND (c = 3) AND (d = 4))" })),
    );
    expect(candidates[0].columns).toEqual(["b", "c", "d"]);
  });

  it("never invents a column when the scan has no usable filter", () => {
    expect(findIndexCandidates(plan(seqScan({ filter: null })))).toEqual([]);
    expect(findIndexCandidates(plan(seqScan({ filter: "(lower(x) = 'a')" })))).toEqual([]);
  });

  it("skips cheap scans and index scans", () => {
    expect(
      findIndexCandidates(plan(seqScan({ total_cost: MIN_SCAN_COST_FOR_SUGGESTION - 1 }))),
    ).toEqual([]);
    expect(findIndexCandidates(plan(seqScan({ node_type: "Index Scan" })))).toEqual([]);
  });

  it("finds nested scans and de-duplicates identical suggestions", () => {
    const root = node({
      node_type: "Hash Join",
      total_cost: 5000,
      children: [seqScan({ id: "a" }), seqScan({ id: "b" }), seqScan({ id: "c", relation: "users", filter: "(id = 1)" })],
    });
    const candidates = findIndexCandidates(plan(root));
    expect(candidates.map((c) => c.tableName)).toEqual(["orders", "users"]);
  });
});

describe("compareWhatIf", () => {
  const before = plan(node({ node_type: "Hash Join", total_cost: 2000, children: [seqScan()] }));
  const candidates = findIndexCandidates(before);

  it("reports the planner cost reduction from the two real plans", () => {
    const after = plan(node({ node_type: "Hash Join", total_cost: 500, children: [seqScan({ node_type: "Index Scan", total_cost: 8 })] }));
    const result = compareWhatIf(before, after, candidates);
    expect(result.beforeCost).toBe(2000);
    expect(result.afterCost).toBe(500);
    expect(result.costReductionPercent).toBe(75);
    expect(result.costRatio).toBe(4);
    expect(result.resolvedTables).toEqual(["orders"]);
  });

  it("does not claim a win when the planner keeps the full scan", () => {
    const after = plan(node({ node_type: "Hash Join", total_cost: 2000, children: [seqScan()] }));
    const result = compareWhatIf(before, after, candidates);
    expect(result.costReductionPercent).toBe(0);
    expect(result.resolvedTables).toEqual([]);
  });

  it("clamps negative improvements to zero", () => {
    const after = plan(node({ total_cost: 3000 }));
    expect(compareWhatIf(before, after, candidates).costReductionPercent).toBe(0);
  });

  it("returns nulls when costs are unknown", () => {
    const result = compareWhatIf(plan(node({ total_cost: null })), plan(node({ total_cost: null })), []);
    expect(result.costReductionPercent).toBeNull();
    expect(result.costRatio).toBeNull();
  });
});
