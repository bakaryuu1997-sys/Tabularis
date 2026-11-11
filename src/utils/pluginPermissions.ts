import * as hostApi from "../pluginApi";

/**
 * Host APIs a plugin's UI code must declare in its manifest `permissions` list before it can use them.
 *
 * - `connection`: read the active connection id, driver and schema (`usePluginConnection`)
 * - `query`: run read-only SQL on the active connection (`usePluginQuery`)
 * - `settings`: read and write the plugin's own settings (`usePluginSetting`)
 * - `modal`: open host-managed modals (`usePluginModal`)
 * - `open_url`: open web links in the system browser (`openUrl`)
 *
 * Toasts, the theme, translations and `defineSlot` are always available.
 */
export const GATED_PERMISSIONS = ["connection", "query", "settings", "modal", "open_url"] as const;

export type PluginPermission = (typeof GATED_PERMISSIONS)[number];

export interface ResolvedPermissions {
  /** Permissions the plugin may use. */
  granted: ReadonlySet<PluginPermission>;
  /** True when the manifest has no `permissions` field: an older plugin that keeps the full API. */
  legacy: boolean;
  /** Declared values that are not permissions (typos, or permissions from a newer host). */
  unknown: string[];
}

/** Turns the manifest's `permissions` field into the set a plugin gets. */
export function resolvePermissions(declared: readonly string[] | null | undefined): ResolvedPermissions {
  if (declared == null) {
    return { granted: new Set(GATED_PERMISSIONS), legacy: true, unknown: [] };
  }
  const known = new Set<string>(GATED_PERMISSIONS);
  const granted = new Set<PluginPermission>();
  const unknown: string[] = [];
  for (const value of declared) {
    if (known.has(value)) granted.add(value as PluginPermission);
    else unknown.push(value);
  }
  return { granted, legacy: false, unknown };
}

/** Web link schemes plugin code may open. Anything else (`file:`, custom app schemes…) is refused. */
const OPENABLE_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

function denial(pluginId: string, permission: PluginPermission): Error {
  return new Error(
    `Plugin "${pluginId}" tried to use the "${permission}" API but does not list "${permission}" in its manifest permissions.`,
  );
}

type HostApi = typeof hostApi;

/**
 * Builds the API object one plugin receives as `__TABULARIS_API__`.
 *
 * - Hooks for permissions the plugin did not declare return inert stubs (reads) or throw (writes), so a
 *   component that skips a permission fails loudly instead of silently gaining access.
 * - `usePluginSetting` and `usePluginTranslation` always use the plugin's own id, whatever id is passed in,
 *   so one plugin cannot read or overwrite another plugin's settings.
 * - `openUrl` only opens http(s) and mailto links.
 *
 * This is cooperative: plugin code shares the main webview and can still reach `window.__TAURI_INTERNALS__`
 * or the legacy global `window.__TABULARIS_API__`. See `plugins/SANDBOX_DESIGN.md`.
 */
export function createPluginApi(
  pluginId: string,
  permissions: ResolvedPermissions,
  base: HostApi = hostApi,
): HostApi {
  const allowed = (permission: PluginPermission) => permissions.granted.has(permission);

  return {
    ...base,

    usePluginConnection: () => {
      const real = base.usePluginConnection();
      return allowed("connection") ? real : { connectionId: null, driver: null, schema: null };
    },

    usePluginQuery: () => {
      const real = base.usePluginQuery();
      if (allowed("query")) return real;
      return {
        executeQuery: async () => {
          throw denial(pluginId, "query");
        },
        loading: false,
        error: null,
      };
    },

    usePluginSetting: () => {
      const real = base.usePluginSetting(pluginId);
      if (allowed("settings")) return real;
      const deny = () => {
        throw denial(pluginId, "settings");
      };
      return {
        getSetting: <T = unknown>(_key: string, defaultValue?: T) => defaultValue as T,
        setSetting: deny,
        setSettings: deny,
      };
    },

    usePluginModal: () => {
      const real = base.usePluginModal();
      if (allowed("modal")) return real;
      const deny = () => {
        throw denial(pluginId, "modal");
      };
      return { openModal: deny, closeModal: deny };
    },

    usePluginTranslation: () => base.usePluginTranslation(pluginId),

    openUrl: async (url: string) => {
      if (!allowed("open_url")) throw denial(pluginId, "open_url");
      let protocol: string;
      try {
        protocol = new URL(url).protocol;
      } catch {
        throw new Error(`Plugin "${pluginId}" tried to open an invalid URL.`);
      }
      if (!OPENABLE_PROTOCOLS.has(protocol)) {
        throw new Error(`Plugin "${pluginId}" tried to open a "${protocol}" link; only http, https and mailto are allowed.`);
      }
      return base.openUrl(url);
    },
  };
}
