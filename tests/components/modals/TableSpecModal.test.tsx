import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { TableSpecModal } from "../../../src/components/modals/TableSpecModal";
import { useDatabase } from "../../../src/hooks/useDatabase";

vi.mock("lucide-react", async (importOriginal) => ({ ...(await importOriginal<typeof import("lucide-react")>()) }));
vi.mock("../../../src/hooks/useDatabase", () => ({ useDatabase: vi.fn() }));

const col = { name: "id", data_type: "integer", is_pk: true, is_nullable: false, is_auto_increment: false };

const backend = (savePath: string | null = "/tmp/out.xlsx") =>
  vi.mocked(invoke).mockImplementation((async (cmd: string) => {
    if (cmd === "get_schema_snapshot") return [{ name: "users", columns: [col], foreign_keys: [] }, { name: "orders", columns: [col], foreign_keys: [] }];
    if (cmd === "get_schema_comments") return { tables: { users: "顧客" }, columns: {} };
    if (cmd === "get_indexes") return [];
    if (cmd === "save_binary_file_with_dialog") return savePath;
    throw new Error(`unexpected ${cmd}`);
  }) as never);

const saveCall = () => vi.mocked(invoke).mock.calls.find(([cmd]) => cmd === "save_binary_file_with_dialog");

describe("TableSpecModal", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
    vi.mocked(useDatabase).mockReturnValue({
      activeConnectionId: "c1",
      activeConnectionName: "Prod",
      activeDatabaseName: "shop",
      activeSchema: "public",
    } as never);
  });

  it("renders nothing while closed", () => {
    const { container } = render(<TableSpecModal isOpen={false} onClose={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("exports the workbook through the backend save dialog, never a path of its own", async () => {
    backend();
    render(<TableSpecModal isOpen onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("tableSpec.export"));
    await waitFor(() => expect(screen.getByText("tableSpec.saved")).toBeInTheDocument());
    const args = saveCall()?.[1] as Record<string, unknown>;
    expect(args.extensions).toEqual(["xlsx"]);
    expect(args.defaultFileName).toMatch(/^table_definitions_shop_\d{8}\.xlsx$/);
    expect(typeof args.base64Data).toBe("string");
    expect(args).not.toHaveProperty("path");
  });

  it("offers a single table when opened from one, and exports only that table", async () => {
    backend();
    render(<TableSpecModal isOpen onClose={vi.fn()} tableName="users" />);
    expect(screen.getByText("tableSpec.scopeTable")).toBeInTheDocument();
    fireEvent.click(screen.getByText("tableSpec.export"));
    await waitFor(() => expect(saveCall()).toBeTruthy());
  });

  it("warns when the database has no comments", async () => {
    vi.mocked(invoke).mockImplementation((async (cmd: string) => {
      if (cmd === "get_schema_snapshot") return [{ name: "users", columns: [col], foreign_keys: [] }];
      if (cmd === "get_schema_comments") return { tables: {}, columns: {} };
      if (cmd === "get_indexes") return [];
      return "/tmp/out.xlsx";
    }) as never);
    render(<TableSpecModal isOpen onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("tableSpec.export"));
    expect(await screen.findByText("tableSpec.noComments")).toBeInTheDocument();
  });

  it("writes nothing and shows no success when the save dialog is cancelled", async () => {
    backend(null);
    render(<TableSpecModal isOpen onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("tableSpec.export"));
    await waitFor(() => expect(saveCall()).toBeTruthy());
    expect(screen.queryByText("tableSpec.saved")).not.toBeInTheDocument();
  });

  it("shows the error when loading fails", async () => {
    vi.mocked(invoke).mockRejectedValue("connection lost");
    render(<TableSpecModal isOpen onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("tableSpec.export"));
    expect(await screen.findByRole("alert")).toHaveTextContent(/connection lost|Could not read columns/);
  });

  it("cannot export without an active connection", () => {
    vi.mocked(useDatabase).mockReturnValue({ activeConnectionId: null } as never);
    render(<TableSpecModal isOpen onClose={vi.fn()} />);
    expect(screen.getByText("tableSpec.export").closest("button")).toBeDisabled();
  });

  it("starts clean each time it is opened", async () => {
    backend();
    const { rerender } = render(<TableSpecModal isOpen onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("tableSpec.export"));
    await screen.findByText("tableSpec.saved");
    rerender(<TableSpecModal isOpen={false} onClose={vi.fn()} />);
    rerender(<TableSpecModal isOpen onClose={vi.fn()} />);
    expect(screen.queryByText("tableSpec.saved")).not.toBeInTheDocument();
  });
});
