import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SqlTemplatesModal } from "../../../src/components/modals/SqlTemplatesModal";
import { resolveSql, DEFAULT_TEMPLATES } from "../../../src/utils/sqlTemplates";

describe("SqlTemplatesModal", () => {
  it("renders templates and filters by search query", () => {
    const onInsert = vi.fn();
    const onClose = vi.fn();

    render(
      <SqlTemplatesModal
        isOpen={true}
        onClose={onClose}
        onInsert={onInsert}
      />,
    );

    expect(screen.getByText(/SELECT \.\.\. FROM \.\.\. WHERE/)).toBeInTheDocument();
    expect(screen.getAllByText(/JOIN \.\.\. ON/)[0]).toBeInTheDocument();

    const searchInput = screen.getByRole("textbox");
    fireEvent.change(searchInput, { target: { value: "LIMIT" } });

    expect(screen.getAllByText(/Phân trang/)[0]).toBeInTheDocument();
  });

  it("calls onInsert with sql when insert button clicked", () => {
    const onInsert = vi.fn();
    const onClose = vi.fn();

    render(
      <SqlTemplatesModal
        isOpen={true}
        onClose={onClose}
        onInsert={onInsert}
      />,
    );

    const insertBtns = screen.getAllByText(/Chèn vào code/);
    fireEvent.click(insertBtns[0]);

    expect(onInsert).toHaveBeenCalledTimes(1);
    expect(onInsert).toHaveBeenCalledWith(expect.stringContaining("SELECT"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("allows filling parameters and inserting customized sql without mutating original template", () => {
    const onInsert = vi.fn();
    const onClose = vi.fn();

    render(
      <SqlTemplatesModal
        isOpen={true}
        onClose={onClose}
        onInsert={onInsert}
        tables={["customers", "orders"]}
        activeTable="customers"
      />,
    );

    // Click "Điền tham số" on the first template (SELECT ... FROM ... WHERE)
    const paramBtns = screen.getAllByText(/Điền tham số/);
    expect(paramBtns.length).toBeGreaterThan(0);
    fireEvent.click(paramBtns[0]);

    // Check that inputs appear
    const tableNameInput = screen.getByPlaceholderText("customers");
    expect(tableNameInput).toBeInTheDocument();

    // Type a custom table name
    fireEvent.change(tableNameInput, { target: { value: "my_custom_table" } });

    // The card should now show "Đã tùy biến"
    expect(screen.getByText(/Đã tùy biến/)).toBeInTheDocument();

    // Click "Chèn vào code"
    const insertBtns = screen.getAllByText(/Chèn vào code/);
    fireEvent.click(insertBtns[0]);

    expect(onInsert).toHaveBeenCalledWith(expect.stringContaining("my_custom_table"));

    // Verify original template definition was NOT mutated
    const origTmpl = DEFAULT_TEMPLATES.find((t) => t.id === "sel-from-where");
    expect(origTmpl?.sql).toContain("{{tableName}}");
    expect(origTmpl?.params?.find((p) => p.key === "tableName")?.defaultValue).toBe("table_name");
  });

  it("correctly resolves sql with fallback and custom values via resolveSql helper", () => {
    const tmpl = DEFAULT_TEMPLATES.find((t) => t.id === "sel-from-where")!;
    
    // Default resolve
    const defaultSql = resolveSql(tmpl);
    expect(defaultSql).toContain("FROM\n  table_name");
    expect(defaultSql).toContain("SELECT\n  *");

    // With activeTable
    const withActiveTable = resolveSql(tmpl, undefined, "orders");
    expect(withActiveTable).toContain("FROM\n  orders");

    // With custom params
    const customSql = resolveSql(
      tmpl,
      { tableName: "products", columns: "id, price", condition: "price > 100" },
      "orders",
    );
    expect(customSql).toContain("FROM\n  products");
    expect(customSql).toContain("SELECT\n  id, price");
    expect(customSql).toContain("WHERE\n  price > 100");
  });
});
