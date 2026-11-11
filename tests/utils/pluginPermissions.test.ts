import { describe, expect, it, vi } from "vitest";
import {
  GATED_PERMISSIONS,
  createPluginApi,
  resolvePermissions,
} from "../../src/utils/pluginPermissions";

type Base = Parameters<typeof createPluginApi>[2];

function fakeBase() {
  const calls = {
    usePluginSetting: vi.fn(),
    usePluginTranslation: vi.fn(),
    openUrl: vi.fn(async () => undefined),
    executeQuery: vi.fn(async () => ({ columns: ["a"], rows: [[1]] })),
    openModal: vi.fn(),
    setSetting: vi.fn(),
  };
  const base = {
    usePluginConnection: () => ({ connectionId: "c1", driver: "postgres", schema: "public" }),
    usePluginQuery: () => ({ executeQuery: calls.executeQuery, loading: false, error: null }),
    usePluginSetting: (id: string) => {
      calls.usePluginSetting(id);
      return { getSetting: () => "stored", setSetting: calls.setSetting, setSettings: vi.fn() };
    },
    usePluginModal: () => ({ openModal: calls.openModal, closeModal: vi.fn() }),
    usePluginTranslation: (id: string) => {
      calls.usePluginTranslation(id);
      return (k: string) => k;
    },
    usePluginToast: () => ({ showInfo: vi.fn(), showError: vi.fn(), showWarning: vi.fn() }),
    usePluginTheme: () => ({ themeId: "dark" }),
    openUrl: calls.openUrl,
    defineSlot: (slot: string, component: unknown) => ({ __slot: slot, component }),
  } as unknown as Base;
  return { base, calls };
}

const granted = (...p: string[]) => resolvePermissions(p);

describe("resolvePermissions", () => {
  it("treats a manifest without the field as a legacy plugin with the full API", () => {
    for (const declared of [undefined, null]) {
      const result = resolvePermissions(declared);
      expect(result.legacy).toBe(true);
      expect([...result.granted].sort()).toEqual([...GATED_PERMISSIONS].sort());
    }
  });

  it("grants exactly what is declared", () => {
    const result = resolvePermissions(["query", "settings"]);
    expect(result.legacy).toBe(false);
    expect([...result.granted].sort()).toEqual(["query", "settings"]);
    expect(result.unknown).toEqual([]);
  });

  it("an empty list grants nothing, unlike a missing list", () => {
    const result = resolvePermissions([]);
    expect(result.legacy).toBe(false);
    expect(result.granted.size).toBe(0);
  });

  it("reports unknown values and ignores them", () => {
    const result = resolvePermissions(["query", "root", "Query"]);
    expect([...result.granted]).toEqual(["query"]);
    expect(result.unknown).toEqual(["root", "Query"]);
  });
});

describe("createPluginApi", () => {
  it("passes the real hooks through when the permission is declared", async () => {
    const { base, calls } = fakeBase();
    const api = createPluginApi("p", granted("query", "connection", "settings", "modal", "open_url"), base);

    expect(api.usePluginConnection().connectionId).toBe("c1");
    await api.usePluginQuery().executeQuery("SELECT 1");
    expect(calls.executeQuery).toHaveBeenCalledWith("SELECT 1");
    expect(api.usePluginSetting("p").getSetting("k")).toBe("stored");
    api.usePluginModal().openModal({} as never);
    expect(calls.openModal).toHaveBeenCalled();
  });

  it("refuses queries without the query permission", async () => {
    const { base, calls } = fakeBase();
    const api = createPluginApi("p", granted("connection"), base);
    const { executeQuery } = api.usePluginQuery();
    await expect(executeQuery("SELECT 1")).rejects.toThrow(/does not list "query"/);
    expect(calls.executeQuery).not.toHaveBeenCalled();
  });

  it("hides the connection without the connection permission", () => {
    const { base } = fakeBase();
    const api = createPluginApi("p", granted(), base);
    expect(api.usePluginConnection()).toEqual({ connectionId: null, driver: null, schema: null });
  });

  it("returns defaults for settings reads and throws on writes without the settings permission", () => {
    const { base, calls } = fakeBase();
    const api = createPluginApi("p", granted(), base);
    const settings = api.usePluginSetting("p");
    expect(settings.getSetting("k", "fallback")).toBe("fallback");
    expect(() => settings.setSetting("k", 1)).toThrow(/"settings"/);
    expect(() => settings.setSettings({ k: 1 })).toThrow(/"settings"/);
    expect(calls.setSetting).not.toHaveBeenCalled();
  });

  it("always uses the plugin's own id for settings and translations", () => {
    const { base, calls } = fakeBase();
    const api = createPluginApi("mine", granted("settings"), base);
    (api.usePluginSetting as (id: string) => unknown)("someone-else");
    (api.usePluginTranslation as (id: string) => unknown)("someone-else");
    expect(calls.usePluginSetting).toHaveBeenCalledWith("mine");
    expect(calls.usePluginTranslation).toHaveBeenCalledWith("mine");
  });

  it("refuses modals without the modal permission", () => {
    const { base, calls } = fakeBase();
    const api = createPluginApi("p", granted(), base);
    expect(() => api.usePluginModal().openModal({} as never)).toThrow(/"modal"/);
    expect(calls.openModal).not.toHaveBeenCalled();
  });

  it("keeps toast, theme and defineSlot available without any permission", () => {
    const { base } = fakeBase();
    const api = createPluginApi("p", granted(), base);
    expect(api.usePluginToast()).toBeTruthy();
    expect(api.usePluginTheme().themeId).toBe("dark");
    expect(api.defineSlot("data-grid.toolbar.actions", null)).toEqual({
      __slot: "data-grid.toolbar.actions",
      component: null,
    });
  });

  it("gives a legacy plugin the full API", async () => {
    const { base, calls } = fakeBase();
    const api = createPluginApi("old", resolvePermissions(undefined), base);
    await api.usePluginQuery().executeQuery("SELECT 1");
    await api.openUrl("https://example.com");
    expect(calls.executeQuery).toHaveBeenCalled();
    expect(calls.openUrl).toHaveBeenCalledWith("https://example.com");
  });

  describe("openUrl", () => {
    it("needs the open_url permission", async () => {
      const { base, calls } = fakeBase();
      const api = createPluginApi("p", granted(), base);
      await expect(api.openUrl("https://example.com")).rejects.toThrow(/"open_url"/);
      expect(calls.openUrl).not.toHaveBeenCalled();
    });

    it("opens http, https and mailto links", async () => {
      const { base, calls } = fakeBase();
      const api = createPluginApi("p", granted("open_url"), base);
      for (const url of ["http://a.test/", "https://a.test/x?y=1", "mailto:me@a.test"]) {
        await api.openUrl(url);
      }
      expect(calls.openUrl).toHaveBeenCalledTimes(3);
    });

    it.each(["file:///etc/passwd", "javascript:alert(1)", "ms-settings:network", "tauri://localhost", "not a url", ""])(
      "refuses %s",
      async (url) => {
        const { base, calls } = fakeBase();
        const api = createPluginApi("p", granted("open_url"), base);
        await expect(api.openUrl(url)).rejects.toThrow();
        expect(calls.openUrl).not.toHaveBeenCalled();
      },
    );
  });
});
