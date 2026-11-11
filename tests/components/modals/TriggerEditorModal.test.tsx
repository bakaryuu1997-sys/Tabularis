import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { TriggerEditorModal } from "../../../src/components/modals/TriggerEditorModal";

const dbState = vi.hoisted(() => ({
  activeSchema: "app" as string | null,
  activeCapabilities: { schemas: true } as { schemas?: boolean } | null,
}));

// The modal re-initialises its form whenever `t` changes, so the mock must return the same function every
// render (the shared setup mock creates a new one each time, which loops forever here).
vi.mock("react-i18next", () => {
  const t = (key: string) => key;
  const i18n = { language: "en", changeLanguage: vi.fn() };
  const value = { t, i18n };
  return { useTranslation: () => value, initReactI18next: { type: "3rdParty", init: vi.fn() } };
});

vi.mock("lucide-react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("lucide-react")>()),
}));

// The Monaco-based editor needs the theme provider and is irrelevant to the generated SQL.
vi.mock("../../../src/components/ui/SqlEditorWrapper", () => ({
  SqlEditorWrapper: () => null,
}));

vi.mock("../../../src/hooks/useDatabase", () => ({
  useDatabase: () => ({
    activeSchema: dbState.activeSchema,
    activeCapabilities: dbState.activeCapabilities,
  }),
}));

vi.mock("../../../src/hooks/useAlert", () => ({
  useAlert: () => ({ showAlert: vi.fn() }),
}));

async function saveNewTrigger(schema?: string) {
  render(
    <TriggerEditorModal
      isOpen
      onClose={vi.fn()}
      connectionId="c1"
      tableName="orders"
      schema={schema}
      isNewTrigger
    />,
  );
  fireEvent.change(screen.getByPlaceholderText("triggers.triggerNamePlaceholder"), {
    target: { value: "trg_audit" },
  });
  fireEvent.click(screen.getByText("triggers.create"));
  await waitFor(() => expect(invoke).toHaveBeenCalledWith("create_trigger", expect.anything()));
  const call = vi.mocked(invoke).mock.calls.find(([cmd]) => cmd === "create_trigger");
  return (call?.[1] as { triggerSql: string }).triggerSql;
}

describe("TriggerEditorModal table qualification", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
    vi.mocked(invoke).mockResolvedValue(undefined);
    dbState.activeSchema = "app";
    dbState.activeCapabilities = { schemas: true };
  });

  it("qualifies the table with the schema on drivers that have named schemas", async () => {
    const sql = await saveNewTrigger();
    expect(sql).toContain('ON "app"."orders"');
  });

  it("leaves the table unqualified on drivers without named schemas (MySQL error 1435)", async () => {
    dbState.activeCapabilities = { schemas: false };
    const sql = await saveNewTrigger("shop");
    expect(sql).toContain('ON "orders"');
    expect(sql).not.toContain('"shop"');
  });

  it("does not qualify the table when no capabilities are known", async () => {
    dbState.activeCapabilities = null;
    const sql = await saveNewTrigger();
    expect(sql).toContain('ON "orders"');
  });
});
