import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, renderHook, screen } from "@testing-library/react";
import { MiniResultGrid } from "../../../src/components/ui/MiniResultGrid";
import { RowEditorSidebar } from "../../../src/components/ui/RowEditorSidebar";
import { CellHistoryPanel } from "../../../src/components/notebook/CellHistoryPanel";
import { usePresentationMasking } from "../../../src/hooks/usePresentationMasking";
import { PresentationContext } from "../../../src/contexts/PresentationContext";
import { SettingsContext, DEFAULT_SETTINGS } from "../../../src/contexts/SettingsContext";
import type { ReactNode } from "react";

vi.mock("lucide-react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("lucide-react")>()),
}));

// jsdom has no layout, so the real virtualizer renders no rows. Render every row instead.
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({ index, key: index, start: index * 28, size: 28, end: (index + 1) * 28 })),
    getTotalSize: () => count * 28,
    measureElement: () => undefined,
    scrollToIndex: () => undefined,
  }),
}));

// Stand-ins for the heavy children: what matters here is which values reach them.
vi.mock("../../../src/components/ui/FieldEditor", () => ({
  FieldEditor: ({ name, value }: { name: string; value: unknown }) => (
    <input aria-label={`field-${name}`} readOnly value={String(value ?? "")} />
  ),
}));
vi.mock("../../../src/components/ui/SlotAnchor", () => ({
  SlotAnchor: ({ name, context }: { name: string; context: { rowData?: Record<string, unknown> } }) => (
    <div data-testid={`slot-${name}`}>{JSON.stringify(context.rowData ?? {})}</div>
  ),
}));

const EMAIL = "alice.nguyen@example.com";

const Wrap = ({
  presenting,
  settings = {},
  children,
}: {
  presenting: boolean;
  settings?: Record<string, unknown>;
  children: ReactNode;
}) => (
  <SettingsContext.Provider
    value={{ settings: { ...DEFAULT_SETTINGS, ...settings }, updateSetting: vi.fn(), isLoading: false, loadSettings: vi.fn(), resetSettings: vi.fn() } as never}
  >
    <PresentationContext.Provider
      value={{ isPresentationMode: presenting, togglePresentationMode: vi.fn(), exitPresentationMode: vi.fn() }}
    >
      {children}
    </PresentationContext.Provider>
  </SettingsContext.Provider>
);

describe("usePresentationMasking", () => {
  const run = (presenting: boolean, settings: Record<string, unknown> = {}) =>
    renderHook(() => usePresentationMasking(), {
      wrapper: ({ children }) => (
        <Wrap presenting={presenting} settings={settings}>
          {children}
        </Wrap>
      ),
    }).result.current;

  it("changes nothing outside presentation mode", () => {
    const m = run(false);
    const record = { email: EMAIL };
    expect(m.isMasked("email")).toBe(false);
    expect(m.maskRecord(record)).toBe(record);
    expect(m.maskSql("SELECT 'x'")).toBe("SELECT 'x'");
    const rows = [[EMAIL]];
    expect(m.maskRows(rows, ["email"])).toBe(rows);
  });

  it("masks while presenting, using the profile and extra columns from the settings", () => {
    const m = run(true, { maskingProfile: "redacted", maskingExtraColumns: "note" });
    expect(m.isMasked("email")).toBe(true);
    expect(m.isMasked("note")).toBe(true);
    expect(m.isMasked("status")).toBe(false);
    expect(m.maskValue("email", EMAIL)).toBe("[REDACTED]");
    expect(m.maskRecord({ email: EMAIL, status: "ok" })).toEqual({ email: "[REDACTED]", status: "ok" });
    expect(m.maskSql("SELECT * FROM t WHERE a = 'x'")).toBe("SELECT * FROM t WHERE a = '•••'");
  });

  it("works without any provider (other windows, tests)", () => {
    const { result } = renderHook(() => usePresentationMasking());
    expect(result.current.isPresentationMode).toBe(false);
    expect(result.current.maskSql("SELECT 'x'")).toBe("SELECT 'x'");
  });
});

describe("MiniResultGrid", () => {
  const render2 = (presenting: boolean) =>
    render(
      <Wrap presenting={presenting} settings={{ maskingProfile: "full" }}>
        <MiniResultGrid columns={["city", "email"]} rows={[["Hanoi", EMAIL]]} />
      </Wrap>,
    );

  it("shows the real values normally", () => {
    render2(false);
    expect(screen.getByText(EMAIL)).toBeInTheDocument();
  });

  it("masks sensitive columns while presenting and leaves the others", () => {
    render2(true);
    expect(screen.queryByText(EMAIL)).not.toBeInTheDocument();
    expect(screen.getByText("Hanoi")).toBeInTheDocument();
  });
});

describe("RowEditorSidebar", () => {
  const renderSidebar = (presenting: boolean) =>
    render(
      <Wrap presenting={presenting} settings={{ maskingProfile: "full" }}>
        <RowEditorSidebar
          isOpen
          onClose={vi.fn()}
          rowData={{ city: "Hanoi", email: EMAIL }}
          rowIndex={0}
          isInsertion={false}
          columns={[{ name: "city" }, { name: "email" }]}
          onChange={vi.fn()}
        />
      </Wrap>,
    );

  beforeEach(() => vi.clearAllMocks());

  it("shows editable fields with the real values normally", () => {
    renderSidebar(false);
    expect(screen.getByLabelText("field-email")).toHaveValue(EMAIL);
  });

  it("replaces a sensitive field with masked, non-editable text while presenting", () => {
    renderSidebar(true);
    expect(screen.queryByLabelText("field-email")).not.toBeInTheDocument();
    expect(screen.getByLabelText("email")).toHaveTextContent("••••••••");
    expect(screen.getByLabelText("field-city")).toHaveValue("Hanoi");
  });

  it("never hands the real value to plugin slots while presenting", () => {
    renderSidebar(true);
    for (const slot of screen.getAllByTestId(/^slot-/)) {
      expect(slot.textContent).not.toContain(EMAIL);
    }
  });

  it("does not turn the masked text into an edit", () => {
    const onChange = vi.fn();
    render(
      <Wrap presenting settings={{ maskingProfile: "full" }}>
        <RowEditorSidebar
          isOpen
          onClose={vi.fn()}
          rowData={{ email: EMAIL }}
          rowIndex={0}
          isInsertion={false}
          columns={[{ name: "email" }]}
          onChange={onChange}
        />
      </Wrap>,
    );
    fireEvent.click(screen.getByLabelText("email"));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("CellHistoryPanel", () => {
  const history = [{ query: "SELECT * FROM users WHERE email = 'alice@example.com'", timestamp: 1, result: { columns: [], rows: [] } }] as never;

  it("hides query literals while presenting", () => {
    render(
      <Wrap presenting>
        <CellHistoryPanel history={history} onRestore={vi.fn()} onClose={vi.fn()} />
      </Wrap>,
    );
    expect(screen.queryByText(/alice@example.com/)).not.toBeInTheDocument();
    expect(screen.getByText(/WHERE email = '•••'/)).toBeInTheDocument();
  });

  it("shows the query normally", () => {
    render(
      <Wrap presenting={false}>
        <CellHistoryPanel history={history} onRestore={vi.fn()} onClose={vi.fn()} />
      </Wrap>,
    );
    expect(screen.getByText(/alice@example.com/)).toBeInTheDocument();
  });
});
