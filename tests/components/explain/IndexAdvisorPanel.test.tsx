import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { IndexAdvisorPanel } from "../../../src/components/explain/IndexAdvisorPanel";
import type { ExplainNode, ExplainPlan } from "../../../src/types/explain";

vi.mock("lucide-react", async (importOriginal) => ({ ...(await importOriginal<typeof import("lucide-react")>()) }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("../../../src/hooks/useAlert", () => ({ useAlert: () => ({ showAlert: vi.fn() }) }));
vi.mock("../../../src/utils/clipboard", () => ({ copyTextToClipboard: vi.fn().mockResolvedValue(undefined) }));

const node = (o: Partial<ExplainNode>): ExplainNode => ({
  id: "n", node_type: "Result", relation: null, startup_cost: 0, total_cost: 0, plan_rows: null,
  actual_rows: null, actual_time_ms: null, actual_loops: null, buffers_hit: null, buffers_read: null,
  filter: null, index_condition: null, join_type: null, hash_condition: null, extra: {}, children: [], ...o,
});
const plan = (root: ExplainNode): ExplainPlan => ({
  root, planning_time_ms: null, execution_time_ms: null, original_query: "SELECT * FROM orders WHERE user_id = 1",
  driver: "x", has_analyze_data: false, raw_output: null,
});

const before = plan(node({ node_type: "Seq Scan", relation: "orders", total_cost: 1000, filter: "(user_id = 1)" }));
const after = plan(node({ node_type: "Index Scan", relation: "orders", total_cost: 8, index_condition: "(user_id = 1)" }));

function mockBackend(whatIf: unknown) {
  vi.mocked(invoke).mockImplementation(async (cmd: string) => {
    if (cmd === "explain_query_what_if") return whatIf;
    if (cmd === "get_create_index_sql") return ['CREATE INDEX "idx_orders_user_id" ON "public"."orders" ("user_id")'];
    throw new Error(`unexpected ${cmd}`);
  });
}

describe("IndexAdvisorPanel", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows planner-verified numbers and driver-generated DDL", async () => {
    mockBackend({ status: "plan", plan: after });
    render(<IndexAdvisorPanel plan={before} connectionId="c1" schema="public" />);

    await waitFor(() => expect(screen.getByText("-99.2%")).toBeInTheDocument());
    expect(screen.getByText("explainDiff.verifiedUsed")).toBeInTheDocument();
    expect(await screen.findByText(/CREATE INDEX "idx_orders_user_id"/)).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith("explain_query_what_if", expect.objectContaining({
      connectionId: "c1",
      schema: "public",
      indexes: [{ table: "orders", columns: ["user_id"] }],
    }));
  });

  it("never fabricates numbers when the extension is missing", async () => {
    mockBackend({ status: "extension_missing", extension: "hypopg" });
    render(<IndexAdvisorPanel plan={before} connectionId="c1" />);

    await waitFor(() => expect(screen.getByText("explainDiff.statusExtensionMissing")).toBeInTheDocument());
    expect(screen.queryByText(/^-\d/)).not.toBeInTheDocument();
    expect(screen.queryByText("explainDiff.verifiedUsed")).not.toBeInTheDocument();
  });

  it("reports unsupported drivers without simulating a plan", async () => {
    mockBackend({ status: "unsupported" });
    render(<IndexAdvisorPanel plan={before} connectionId="c1" />);
    await waitFor(() => expect(screen.getByText("explainDiff.statusUnsupported")).toBeInTheDocument());
    expect(screen.queryByText("explainDiff.planComparison")).not.toBeInTheDocument();
  });

  it("does not call the backend without a connection", () => {
    mockBackend({ status: "unsupported" });
    render(<IndexAdvisorPanel plan={before} />);
    expect(screen.getByText("explainDiff.statusNoConnection")).toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("opens DDL in the editor instead of executing it", async () => {
    mockBackend({ status: "plan", plan: after });
    const onInsertSql = vi.fn();
    render(<IndexAdvisorPanel plan={before} connectionId="c1" onInsertSql={onInsertSql} />);

    const button = await screen.findByText("explainDiff.openInEditor");
    await waitFor(() => expect(button.closest("button")).not.toBeDisabled());
    fireEvent.click(button);
    expect(onInsertSql).toHaveBeenCalledWith(expect.stringContaining("CREATE INDEX"));
    expect(invoke).not.toHaveBeenCalledWith("execute_query", expect.anything());
  });

  it("explains when there is nothing to suggest", () => {
    render(<IndexAdvisorPanel plan={plan(node({ node_type: "Index Scan", relation: "orders", total_cost: 5 }))} connectionId="c1" />);
    expect(screen.getByText("explainDiff.noCandidates")).toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalled();
  });
});
