import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryHistoryModal } from "../../../src/components/modals/QueryHistoryModal";
import { QueryHistorySection } from "../../../src/components/layout/sidebar/QueryHistorySection";
import { PresentationContext } from "../../../src/contexts/PresentationContext";
import { copyTextToClipboard } from "../../../src/utils/clipboard";
import { useQueryHistory } from "../../../src/hooks/useQueryHistory";
import { useSettings } from "../../../src/hooks/useSettings";
import { DEFAULT_SETTINGS } from "../../../src/contexts/SettingsContext";
import type { QueryHistoryEntry } from "../../../src/types/queryHistory";
import type { ReactNode } from "react";

vi.mock("lucide-react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("lucide-react")>()),
}));
// The real component colours SQL through Monaco, which jsdom cannot run; the text is what matters here.
vi.mock("../../../src/components/ui/SqlHighlight", () => ({
  SqlHighlight: ({ sql }: { sql: string }) => <pre>{sql}</pre>,
}));
vi.mock("../../../src/hooks/useQueryHistory", () => ({ useQueryHistory: vi.fn() }));
vi.mock("../../../src/hooks/useSettings", () => ({ useSettings: vi.fn() }));
vi.mock("../../../src/utils/clipboard", () => ({ copyTextToClipboard: vi.fn().mockResolvedValue(undefined) }));

const SQL = "UPDATE users SET phone = '0912345678' WHERE email = 'alice@example.com'";

const entry: QueryHistoryEntry = {
  id: "1",
  sql: SQL,
  executedAt: new Date().toISOString(),
  executionTimeMs: 12,
  status: "success",
  rowsAffected: 1,
  error: null,
  database: null,
};

const inContext = (presenting: boolean, node: ReactNode) => (
  <PresentationContext.Provider
    value={{ isPresentationMode: presenting, togglePresentationMode: vi.fn(), exitPresentationMode: vi.fn() }}
  >
    {node}
  </PresentationContext.Provider>
);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useSettings).mockReturnValue({ settings: { ...DEFAULT_SETTINGS }, updateSetting: vi.fn() } as never);
  vi.mocked(useQueryHistory).mockReturnValue({
    entries: [entry],
    deleteEntry: vi.fn(),
    clearHistory: vi.fn(),
  } as never);
});

describe("QueryHistorySection", () => {
  const renderSection = (presenting: boolean) =>
    render(
      inContext(
        presenting,
        <QueryHistorySection
          entries={[entry]}
          isLoading={false}
          recoveryNotice={null}
          onDismissRecoveryNotice={vi.fn()}
          onDoubleClick={vi.fn()}
          onContextMenu={vi.fn()}
          onClearAll={vi.fn()}
        />,
      ),
    );

  it("shows the query as written normally", () => {
    const { container } = renderSection(false);
    expect(container.textContent).toContain("alice@example.com");
  });

  it("hides literal values in the list and in the tooltip while presenting", () => {
    const { container } = renderSection(true);
    expect(container.textContent).not.toContain("alice@example.com");
    expect(container.textContent).not.toContain("0912345678");
    expect(container.textContent).toContain("UPDATE");
    const titled = container.querySelector("[title]") as HTMLElement;
    expect(titled.getAttribute("title")).not.toContain("alice@example.com");
  });
});

describe("QueryHistoryModal", () => {
  const renderModal = (presenting: boolean) =>
    render(
      inContext(
        presenting,
        <QueryHistoryModal isOpen onClose={vi.fn()} onInsertQuery={vi.fn()} onRunQuery={vi.fn()} />,
      ),
    );

  it("hides literals in the shown SQL while presenting", () => {
    const { container } = renderModal(true);
    expect(container.textContent).not.toContain("alice@example.com");
    expect(container.textContent).toContain("WHERE email = '•••'");
  });

  it("copies the masked SQL while presenting", async () => {
    renderModal(true);
    fireEvent.click(screen.getByText("queryHistoryModal.copy"));
    await waitFor(() => expect(copyTextToClipboard).toHaveBeenCalled());
    expect(vi.mocked(copyTextToClipboard).mock.calls[0][0]).not.toContain("alice@example.com");
  });

  it("copies the real SQL when not presenting", async () => {
    renderModal(false);
    fireEvent.click(screen.getByText("queryHistoryModal.copy"));
    await waitFor(() => expect(copyTextToClipboard).toHaveBeenCalledWith(SQL));
  });
});
