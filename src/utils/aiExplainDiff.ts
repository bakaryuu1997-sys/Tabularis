import type { ExplainPlan, ExplainNode } from "../types/explain";

export interface SuggestedIndex {
  tableName: string;
  columns: string[];
  indexName: string;
  ddl: string;
  reason: string;
  estimatedCostReductionPercent: number;
}

export interface ExplainOptimizationAnalysis {
  hasBottlenecks: boolean;
  bottleneckCount: number;
  originalCost: number;
  projectedCost: number;
  costReductionPercent: number;
  estimatedSpeedupFactor: number;
  suggestedIndexes: SuggestedIndex[];
  simulatedAfterPlan: ExplainPlan;
  summary: string;
}

/**
 * Extracts candidate column names from a SQL filter condition.
 * e.g. "(user_id = 42)" -> ["user_id"]
 * e.g. "((status = 'active'::text) AND (created_at > '2026-01-01'::date))" -> ["status", "created_at"]
 */
export function extractFilterColumns(filterStr: string | null): string[] {
  if (!filterStr) return [];
  const columns: string[] = [];
  const regex = /\b([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:=|!=|<>|>=|<=|>|<|LIKE|ILIKE|IN\s*\(|IS\s+NULL|IS\s+NOT\s+NULL)/gi;
  let match: RegExpExecArray | null;

  const reserved = new Set([
    "and", "or", "not", "case", "when", "then", "else", "end", "where", "select", "null", "true", "false"
  ]);

  while ((match = regex.exec(filterStr)) !== null) {
    const col = match[1].toLowerCase();
    if (!reserved.has(col) && !columns.includes(col)) {
      columns.push(col);
    }
  }

  return columns;
}

/**
 * Deep clones an ExplainNode tree.
 */
export function cloneExplainNode(node: ExplainNode): ExplainNode {
  return {
    ...node,
    extra: { ...node.extra },
    children: node.children.map(cloneExplainNode),
  };
}

/**
 * Analyzes an ExplainPlan, identifies Sequential Scans and high-cost bottlenecks,
 * suggests optimal indexes, and generates a simulated "After" plan.
 */
export function analyzePlanForOptimization(plan: ExplainPlan): ExplainOptimizationAnalysis {
  const suggestedIndexes: SuggestedIndex[] = [];
  let bottleneckCount = 0;

  const originalCost = plan.root.total_cost ?? 100.0;
  const clonedRoot = cloneExplainNode(plan.root);

  function inspectAndSimulate(node: ExplainNode) {
    const isSeqScan =
      node.node_type.toLowerCase().includes("seq scan") ||
      node.node_type.toLowerCase().includes("sequential scan") ||
      node.node_type.toLowerCase().includes("full scan") ||
      node.node_type.toLowerCase().includes("table access full");

    const relation = node.relation || "table";
    const filter = node.filter || node.index_condition || "";
    const filterCols = extractFilterColumns(filter);

    if (isSeqScan || (node.total_cost && node.total_cost > 100 && filterCols.length > 0)) {
      bottleneckCount++;

      const cols = filterCols.length > 0 ? filterCols : ["id"];
      const cleanCols = cols.slice(0, 3);
      const indexName = `idx_${relation.replace(/[^a-zA-Z0-9_]/g, "_")}_${cleanCols.join("_")}`;
      const ddl = `CREATE INDEX ${indexName} ON ${relation} (${cleanCols.join(", ")});`;

      const reductionPct = 99.2;
      suggestedIndexes.push({
        tableName: relation,
        columns: cleanCols,
        indexName,
        ddl,
        reason: `Quét tuần tự toàn bộ bảng '${relation}' do thiếu chỉ mục trên cột lọc (${cleanCols.join(", ")}).`,
        estimatedCostReductionPercent: reductionPct,
      });

      // Transform node to simulated Index Scan
      const beforeNodeCost = node.total_cost ?? 100;
      node.node_type = "Index Scan";
      node.index_condition = node.filter ?? `(${cleanCols[0]} = ?)`;
      node.total_cost = Math.max(1.0, Math.round(beforeNodeCost * 0.005 * 100) / 100);
      node.startup_cost = Math.min(0.25, node.startup_cost ?? 0.25);

      if (node.actual_time_ms != null) {
        node.actual_time_ms = Math.max(0.1, Math.round(node.actual_time_ms * 0.01 * 100) / 100);
      }
    }

    for (const child of node.children) {
      inspectAndSimulate(child);
    }
  }

  inspectAndSimulate(clonedRoot);

  const projectedCost = clonedRoot.total_cost ?? Math.max(1.0, originalCost * 0.01);
  const costReduction = originalCost > projectedCost ? originalCost - projectedCost : 0;
  const costReductionPercent =
    originalCost > 0
      ? Math.min(99.9, Math.max(0, Math.round((costReduction / originalCost) * 1000) / 10))
      : 0;

  const estimatedSpeedupFactor =
    projectedCost > 0
      ? Math.max(1, Math.round((originalCost / projectedCost) * 10) / 10)
      : 1;

  const simulatedAfterPlan: ExplainPlan = {
    ...plan,
    root: clonedRoot,
    planning_time_ms: plan.planning_time_ms != null ? Math.max(0.5, plan.planning_time_ms * 0.9) : null,
    execution_time_ms:
      plan.execution_time_ms != null
        ? Math.max(0.5, Math.round((plan.execution_time_ms / estimatedSpeedupFactor) * 100) / 100)
        : null,
  };

  const summary = suggestedIndexes.length > 0
    ? `Phát hiện ${bottleneckCount} điểm nghẽn hiệu năng. Đánh chỉ mục đề xuất có thể giảm chi phí truy vấn tới ${costReductionPercent}%.`
    : `Kế hoạch truy vấn đã tối ưu tốt hoặc không có điểm nghẽn quét tuần tự rõ ràng.`;

  return {
    hasBottlenecks: suggestedIndexes.length > 0,
    bottleneckCount,
    originalCost,
    projectedCost,
    costReductionPercent,
    estimatedSpeedupFactor,
    suggestedIndexes,
    simulatedAfterPlan,
    summary,
  };
}
