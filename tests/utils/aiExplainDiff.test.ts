import { describe, it, expect } from "vitest";
import {
  extractFilterColumns,
  cloneExplainNode,
  analyzePlanForOptimization,
} from "../../src/utils/aiExplainDiff";
import type { ExplainPlan, ExplainNode } from "../../src/types/explain";

describe("aiExplainDiff", () => {
  describe("extractFilterColumns", () => {
    it("extracts single filter column", () => {
      const cols = extractFilterColumns("(user_id = 42)");
      expect(cols).toEqual(["user_id"]);
    });

    it("extracts multiple columns with AND/OR", () => {
      const cols = extractFilterColumns(
        "((status = 'active'::text) AND (created_at > '2026-01-01'::date))"
      );
      expect(cols).toContain("status");
      expect(cols).toContain("created_at");
      expect(cols).not.toContain("and");
    });

    it("handles null and empty input gracefully", () => {
      expect(extractFilterColumns(null)).toEqual([]);
      expect(extractFilterColumns("")).toEqual([]);
    });
  });

  describe("analyzePlanForOptimization", () => {
    const mockPlan: ExplainPlan = {
      original_query: "SELECT * FROM orders WHERE user_id = 99;",
      driver: "postgres",
      has_analyze_data: true,
      planning_time_ms: 1.2,
      execution_time_ms: 450.0,
      raw_output: "",
      root: {
        id: "node-1",
        node_type: "Seq Scan",
        relation: "orders",
        startup_cost: 0.0,
        total_cost: 4500.0,
        plan_rows: 150000,
        actual_rows: 1,
        actual_time_ms: 440.0,
        actual_loops: 1,
        buffers_hit: 12,
        buffers_read: 850,
        filter: "(user_id = 99)",
        index_condition: null,
        join_type: null,
        hash_condition: null,
        extra: {},
        children: [],
      },
    };

    it("detects Seq Scan bottleneck and suggests CREATE INDEX", () => {
      const analysis = analyzePlanForOptimization(mockPlan);

      expect(analysis.hasBottlenecks).toBe(true);
      expect(analysis.bottleneckCount).toBe(1);
      expect(analysis.suggestedIndexes).toHaveLength(1);
      expect(analysis.suggestedIndexes[0].tableName).toBe("orders");
      expect(analysis.suggestedIndexes[0].columns).toEqual(["user_id"]);
      expect(analysis.suggestedIndexes[0].ddl).toBe(
        "CREATE INDEX idx_orders_user_id ON orders (user_id);"
      );
      expect(analysis.costReductionPercent).toBeGreaterThan(95);
      expect(analysis.simulatedAfterPlan.root.node_type).toBe("Index Scan");
    });

    it("returns clean result when no bottlenecks exist", () => {
      const optimalPlan: ExplainPlan = {
        ...mockPlan,
        root: {
          id: "node-2",
          node_type: "Index Scan",
          relation: "orders",
          startup_cost: 0.25,
          total_cost: 8.5,
          plan_rows: 1,
          actual_rows: 1,
          actual_time_ms: 0.8,
          actual_loops: 1,
          buffers_hit: 4,
          buffers_read: 0,
          filter: null,
          index_condition: "(user_id = 99)",
          join_type: null,
          hash_condition: null,
          extra: {},
          children: [],
        },
      };

      const analysis = analyzePlanForOptimization(optimalPlan);
      expect(analysis.hasBottlenecks).toBe(false);
      expect(analysis.suggestedIndexes).toHaveLength(0);
    });
  });
});
