import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DataGrid } from "../../../src/components/ui/DataGrid";
import { useDatabase } from "../../../src/hooks/useDatabase";
import { useAlert } from "../../../src/hooks/useAlert";
import { useSettings } from "../../../src/hooks/useSettings";
import { DEFAULT_SETTINGS } from "../../../src/contexts/SettingsContext";

vi.mock("../../../src/hooks/useDatabase", () => ({
  useDatabase: vi.fn(),
}));

vi.mock("../../../src/hooks/useAlert", () => ({
  useAlert: vi.fn(),
}));

vi.mock("../../../src/hooks/useSettings", () => ({
  useSettings: vi.fn(),
}));

describe("DataGrid Visuals & Smart Empty State", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useDatabase).mockReturnValue({
      activeSchema: "public",
      activeDriver: "postgres",
      connections: [],
    } as unknown as ReturnType<typeof useDatabase>);

    vi.mocked(useAlert).mockReturnValue({
      showAlert: vi.fn(),
    } as unknown as ReturnType<typeof useAlert>);

    vi.mocked(useSettings).mockReturnValue({
      settings: { ...DEFAULT_SETTINGS, resultColorByType: true },
      updateSetting: vi.fn(),
      isLoading: false,
      loadSettings: vi.fn(),
      resetSettings: vi.fn(),
    });
  });

  it("renders data type badges in column headers", () => {
    render(
      <DataGrid
        columns={["id", "username"]}
        data={[[1, "alice"]]}
        columnMetadata={[
          { name: "id", data_type: "bigint", is_nullable: false, is_primary_key: true },
          { name: "username", data_type: "varchar", is_nullable: true, is_primary_key: false },
        ]}
      />
    );

    expect(screen.getByText("id")).toBeInTheDocument();
    expect(screen.getByText("username")).toBeInTheDocument();
    expect(screen.getByText("INT8")).toBeInTheDocument();
    expect(screen.getByText("VARCHAR")).toBeInTheDocument();
  });

  it("renders smart empty state when there are no data rows", () => {
    const handleAddRow = vi.fn();

    render(
      <DataGrid
        columns={["id", "title"]}
        data={[]}
        onAddRow={handleAddRow}
      />
    );

    expect(screen.getByText("dataGrid.noDataTitle")).toBeInTheDocument();
    expect(screen.getByText("dataGrid.noDataDesc")).toBeInTheDocument();
    const addBtn = screen.getByText("dataGrid.addFirstRow");
    expect(addBtn).toBeInTheDocument();

    fireEvent.click(addBtn);
    expect(handleAddRow).toHaveBeenCalledTimes(1);
  });

  it("does not render add row button in empty state when readonly is true", () => {
    render(
      <DataGrid
        columns={["id", "title"]}
        data={[]}
        readonly={true}
        onAddRow={vi.fn()}
      />
    );

    expect(screen.getByText("dataGrid.noDataTitle")).toBeInTheDocument();
    expect(screen.queryByText("dataGrid.addFirstRow")).not.toBeInTheDocument();
  });

  it("opens quick statistics popover when clicking on a column type badge", () => {
    render(
      <DataGrid
        columns={["id", "score"]}
        data={[
          [1, 100],
          [2, 200],
        ]}
        columnMetadata={[
          { name: "id", data_type: "bigint", is_nullable: false, is_primary_key: true },
          { name: "score", data_type: "integer", is_nullable: false, is_primary_key: false },
        ]}
      />
    );

    const scoreBadge = screen.getByText("INT");
    expect(scoreBadge).toBeInTheDocument();

    fireEvent.click(scoreBadge);

    expect(screen.getByText("columnProfile.viewFullReport")).toBeInTheDocument();
  });
});
