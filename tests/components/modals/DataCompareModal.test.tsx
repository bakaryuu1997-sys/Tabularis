import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { DataCompareModal } from "../../../src/components/modals/DataCompareModal";

vi.mock("lucide-react", async (importOriginal) => ({ ...(await importOriginal<typeof import("lucide-react")>()) }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("../../../src/hooks/useAlert", () => ({ useAlert: () => ({ showAlert: vi.fn() }) }));
vi.mock("../../../src/utils/clipboard", () => ({ copyTextToClipboard: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../../src/components/ui/SqlPreview", () => ({
  SqlPreview: ({ sql }: { sql: string }) => <pre data-testid="sql-preview">{sql}</pre>,
}));
vi.mock("../../../src/hooks/useDatabase", () => ({
  useDatabase: () => ({
    activeConnectionId: "src",
    connections: [
      { id: "src", name: "Source DB", params: { driver: "postgres" } },
      { id: "tgt", name: "Target DB", params: { driver: "postgres" } },
    ],
  }),
}));

const rowsFor: Record<string, unknown[][]> = {
  src: [[1, "Ann"], [2, "Bob updated"], [3, "Cy"]],
  tgt: [[1, "Ann"], [2, "Bob"], [4, "Dee"]],
};

beforeEach(() => {
  vi.mocked(invoke).mockReset();
  vi.mocked(invoke).mockImplementation(async (cmd: string, args?: unknown) => {
    const a = args as { connectionId: string };
    if (cmd === "get_tables") return [{ name: "people" }];
    if (cmd === "get_columns")
      return [
        { name: "id", data_type: "int", is_pk: true, is_nullable: false, is_auto_increment: true, default_value: null },
        { name: "name", data_type: "text", is_pk: false, is_nullable: true, is_auto_increment: false, default_value: null },
      ];
    if (cmd === "execute_query") return { columns: ["id", "name"], rows: rowsFor[a.connectionId] };
    throw new Error(`unexpected ${cmd}`);
  });
});

async function setup() {
  render(
    <DataCompareModal
      isOpen
      onClose={vi.fn()}
      initial={{ connectionId: "src", table: "people" }}
      onOpenInEditor={vi.fn()}
    />,
  );
  // Order of the selects: source connection, source table, target connection, target table.
  fireEvent.change(screen.getAllByRole("combobox")[2], { target: { value: "tgt" } });
  await waitFor(() => expect(within(screen.getAllByRole("combobox")[3]).getByRole("option", { name: "people" })).toBeInTheDocument());
  fireEvent.change(screen.getAllByRole("combobox")[3], { target: { value: "people" } });
}

describe("DataCompareModal", () => {
  it("preselects the primary key and compares two tables", async () => {
    await setup();
    const compare = screen.getByText("dataCompare.compare").closest("button")!;
    await waitFor(() => expect(compare).not.toBeDisabled());
    fireEvent.click(compare);

    await waitFor(() => expect(screen.getAllByText("dataCompare.onlyInSource").length).toBeGreaterThan(0));
    // Each category appears as a summary card and as a detail section: Cy (insert), Bob (update), Dee (delete).
    expect(screen.getAllByText("dataCompare.onlyInSource")).toHaveLength(2);
    expect(screen.getAllByText("dataCompare.changed")).toHaveLength(2);
    expect(screen.getAllByText("dataCompare.onlyInTarget")).toHaveLength(2);
    expect(screen.getByText("Dee")).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith("execute_query", expect.objectContaining({ connectionId: "tgt" }));
  });

  it("offers a script without deletes by default and adds them on request", async () => {
    await setup();
    const compare = screen.getByText("dataCompare.compare").closest("button")!;
    await waitFor(() => expect(compare).not.toBeDisabled());
    fireEvent.click(compare);
    await waitFor(() => screen.getByText("dataCompare.viewSql"));
    fireEvent.click(screen.getByText("dataCompare.viewSql"));

    const preview = await screen.findByTestId("sql-preview");
    expect(preview.textContent).toContain(`INSERT INTO "people"`);
    expect(preview.textContent).toContain(`UPDATE "people" SET "name" = 'Bob updated' WHERE "id" = 2;`);
    expect(preview.textContent).not.toContain("DELETE");

    fireEvent.click(screen.getByRole("checkbox", { name: /dataCompare.includeDeletes/ }));
    expect(screen.getByTestId("sql-preview").textContent).toContain(`DELETE FROM "people" WHERE "id" = 4;`);
  });

  it("keeps Compare disabled until both sides and a key are chosen", () => {
    render(<DataCompareModal isOpen onClose={vi.fn()} />);
    expect(screen.getByText("dataCompare.compare").closest("button")).toBeDisabled();
  });
});
