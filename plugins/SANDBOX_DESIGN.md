# Plugin UI sandbox: design

Status: **proposal, not implemented.** Stage 1 (permissions, a read-only query gate, per-plugin API objects) is in the
code and described in `PLUGIN_GUIDE.md`. This document describes the isolation that stage 1 deliberately does not provide.

## 1. Where we are

Plugin UI is a pre-built IIFE bundle. `PluginSlotProvider` reads it with `read_plugin_file` and runs it with
`new Function(...)` in the **main webview**. The bundle's components are rendered directly in the host React tree
and call host hooks (`usePluginQuery`, ...) that use host React contexts.

Consequences:

- Plugin code is as trusted as the app itself. It can call **any** Tauri command (`invoke`), read the DOM, read
  `localStorage`, and talk to every open connection.
- The CSP needs `'unsafe-eval'` for `new Function`, which also weakens the app against any future XSS.
- A manifest `permissions` list (stage 1) is a contract that honest plugins follow. A hostile plugin ignores it by
  calling `window.__TAURI_INTERNALS__.invoke(...)` or the legacy global `window.__TABULARIS_API__`.

### What stage 1 changed, honestly

| Threat | Before | After stage 1 |
|--------|--------|---------------|
| Buggy plugin runs `DELETE`/`DROP` through `usePluginQuery` | possible, no safe-mode confirmation | refused by the backend (`execute_plugin_query`) |
| Plugin reads or overwrites another plugin's settings | possible by passing its id | impossible through the API (own id forced) |
| Honest plugin uses more API than it needs | invisible | declared in the manifest, enforced, warned when missing |
| Hostile plugin | full access | **full access (unchanged)** |

## 2. Goals and non-goals

Goals

1. Plugin code cannot call Tauri commands or touch the host DOM, storage or network directly.
2. Everything a plugin can do goes through a small, versioned, permission-checked RPC surface.
3. A plugin that crashes, loops or leaks memory cannot freeze or corrupt the host.
4. The CSP of the main window can drop `'unsafe-eval'`.

Non-goals

- Sandboxing **driver executables** (the Rust-side child processes). They run with the user's OS rights. That is a
  different problem (OS sandboxing, signing) and needs its own design.
- Hiding data from a plugin the user explicitly gave `query` access to. A plugin that may read tables can show or
  send what it reads if it also has network access; network access must therefore be a separate, default-off permission.

## 3. Proposed architecture

```
┌────────────── main webview (trusted) ───────────────┐
│  PluginSlotProvider                                 │
│    └─ <PluginFrame plugin="p" slot="..." context>   │
│         <iframe sandbox="allow-scripts"             │
│                 srcdoc=... csp="default-src 'none'…"│
│         └─ MessagePort ◄──────────────┐             │
│  PluginBridge (host)  ◄───── RPC ─────┘             │
│    • checks permission for every call               │
│    • validates arguments, rate-limits               │
│    • calls the existing guarded commands            │
└──────────────────────────────────────────────────────┘
```

- `sandbox="allow-scripts"` **without** `allow-same-origin`: the frame gets an opaque origin, so it cannot read the
  host's DOM, cookies, `localStorage` or IndexedDB.
- The frame's own CSP (via `srcdoc` meta tag) is `default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src data:`.
  Scripts may run, but there is no `connect-src`, so no network. Eval is confined to the frame.
- One `MessageChannel` per frame. The host never posts to `window.parent` broadcasts, and ignores messages that
  do not come through its own port, which removes origin-spoofing questions.
- The host decides what the plugin sees: `context` is copied (structured clone), not shared.

### 3.1 Rendering

Most of the existing slots are tiny (a toolbar button, a context-menu item). One iframe per instance is heavy and
awkward for layout. Split slots into two kinds:

| Kind | Slots | Plugin provides | Host renders |
|------|-------|-----------------|--------------|
| **Declarative** | `data-grid.toolbar.actions`, `data-grid.context-menu.items`, `sidebar.footer.actions`, `row-editor-sidebar.header.actions` | `{ label, icon, disabled?, onClickAction }` through RPC | the host's own button/menu item; a click sends `action` back to the frame |
| **Embedded** | `row-edit-modal.field.after`, `row-editor-sidebar.field.after`, `settings.plugin.*`, `connection-modal.connection_content`, `row-edit-modal.footer.before` | a full UI | one iframe, auto-sized (the frame reports its height with a `ResizeObserver`; host clamps min/max) |

Declarative slots keep the host's look and keyboard behaviour for free and need no frame per item (one hidden
frame per plugin can serve all its declarative slots).

### 3.2 Theming and i18n

The host sends the theme tokens (CSS variables) and the language in the `init` message and again on change. The
SDK applies them to the frame's `:root`, so plugins keep using the same variables they use today.

### 3.3 RPC surface

Every method maps to an existing hook, adds a permission and is validated host-side.

| SDK call | RPC method | Permission | Host handler |
|----------|-----------|------------|--------------|
| `usePluginQuery().executeQuery` | `query.execute` | `query` | `execute_plugin_query` (read-only gate, row cap, timeout) |
| `usePluginConnection` | `connection.get` | `connection` | active connection id/driver/schema only |
| `usePluginSetting` | `settings.get/set` | `settings` | namespace forced to the plugin id; size limit |
| `usePluginModal` | `modal.open/close` | `modal` | host modal showing a **frame** (no host-rendered plugin HTML) |
| `usePluginToast` | `toast.show` | none | length-limited text, rate-limited |
| `usePluginTheme` | `theme.get` / event | none | tokens only |
| `openUrl` | `url.open` | `open_url` | http/https/mailto only |
| (new) `fetch` | `network.fetch` | `network` | host-side allow-list of origins from the manifest, no cookies |

Rules for every call: reject unknown methods; cap payload size (e.g. 1 MB); cap pending requests per frame;
log denied calls; never put host objects or functions in a response.

### 3.4 Plugin runtime inside the frame

Today plugins get `React` from the host. In a frame the SDK must ship its own React. Options:

1. The host injects a React UMD build into the `srcdoc` (same version as the host, no per-plugin bundling).
   Plugin bundles keep `react` as an external. **Recommended**: bundles built for today's loader keep working.
2. Plugins bundle their own React. Larger bundles, and no longer a shared version.

The `@tabularis/plugin-api` package gets a second entry point (`/sandbox`) whose hooks speak RPC. A plugin built
against the current externals mapping (`@tabularis/plugin-api` → `__TABULARIS_API__`) needs no source change:
the frame defines `__TABULARIS_API__` as the RPC-backed object.

## 4. Things that must be verified in a real build first

These are assumptions that cannot be checked from unit tests. Build a spike on Windows (WebView2), macOS
(WKWebView) and Linux (WebKitGTK) before committing to the design.

1. **Does Tauri's IPC reach a sandboxed `srcdoc` / `blob:` frame?** In the frame, check
   `typeof window.__TAURI_INTERNALS__` and try `fetch('ipc://localhost/...')`. The design needs both to fail. If Tauri
   injects IPC into child frames, the window capability must be narrowed (for example, remote-URL scoping or
   `withGlobalTauri: false` plus frame-level checks) before this is a real boundary.
2. Does the main window's CSP need `frame-src`/`child-src` for `srcdoc`, and does the frame inherit the parent
   CSP (it does for `srcdoc`/`blob:`)? The frame's own meta CSP can only tighten the inherited policy, so the host CSP
   must allow what the frame needs, then the frame narrows it.
3. `ResizeObserver` and `postMessage` behaviour with an opaque origin on all three webviews.
4. Memory and start-up cost with 5 to 10 frames (one per plugin plus embedded instances).
5. Keyboard focus and accessibility across the frame boundary (tab order, screen readers).

## 5. Migration

- Manifest field `runtime`: `"sandbox"` (new) or `"legacy"` (today). Missing means `legacy`.
- Host API version `0.x` stays for `legacy`; the sandbox runtime ships as `1.0`.
- `legacy` plugins keep working for at least two releases, with a permanent notice in Settings → Plugins
  ("runs with full access") and a one-time consent dialog on enable. `permissions` becomes mandatory for `sandbox`.
- The registry marks each release `sandbox: true/false`; the plugin store shows it and can hide `legacy` ones.
- After the deprecation window remove the `new Function` loader and `'unsafe-eval'` from the main CSP, and remove the
  global `window.__TABULARIS_API__` (the SDK's `getHost()` reads it today, so authors using `getHost()` need the new entry point first).

## 6. Test plan

- Unit: bridge validation (unknown method, oversize payload, missing permission, flood), query gate, settings namespace.
- A **hostile plugin fixture** run in a real webview (WebDriver through `tauri-driver`) that tries: `window.parent`
  DOM access, `__TAURI_INTERNALS__`, `fetch` to the network and to `ipc://`, host `localStorage`, forged
  `postMessage`, infinite loop, memory blow-up, 100 MB RPC payload. Every attempt must fail without freezing the host.
- Compatibility: the existing sample plugins from `registry.json` run unchanged in the frame.

## 7. Work breakdown

| Phase | Content | Needs |
|-------|---------|-------|
| 0 | Spike from section 4 on all three platforms; decide go / no-go and CSP changes | a Windows/macOS/Linux dev build |
| 1 | `PluginFrame`, `PluginBridge`, RPC + permission checks, sandbox SDK entry point | phase 0 |
| 2 | Declarative slots (toolbar, menus), embedded slots with auto-height | phase 1 |
| 3 | Migration: `runtime` field, consent UI, registry flag, deprecation notices | phase 2 |
| 4 | Remove the legacy loader, `'unsafe-eval'` and the global | one release after the deprecation window |

## 8. Open decisions

1. Is a `network` permission wanted at all, or do plugins that need the web stay `legacy`/out of the store?
2. Declarative slots change the plugin contract for buttons and menu items. Accept that, or keep one frame per button?
3. Should built-in plugin UI (if any ships in-tree) also use the frame, so there is one code path?
