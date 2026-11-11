import * as React from "react";
import * as ReactJSXRuntime from "react/jsx-runtime";

/**
 * Runs a plugin's IIFE bundle and returns its default component, or `null` when it exports none.
 *
 * The bundle assigns its export to `__tabularis_plugin__`; React, the JSX runtime and the plugin's own
 * API object are passed in as parameters, so the bundle sees `api` (not the shared global) as
 * `__TABULARIS_API__`.
 */
export function evaluatePluginBundle(source: string, api: unknown): unknown {
  const fn = new Function(
    "React",
    "ReactJSXRuntime",
    "__TABULARIS_API__",
    source + "\n return typeof __tabularis_plugin__ !== 'undefined' ? __tabularis_plugin__ : null;",
  );
  const raw = fn(React, ReactJSXRuntime, api) as unknown;
  // Support both direct export (`return Component`) and ES-module style (`return { default: Component }`).
  const component = typeof raw === "function" ? raw : (raw as { default?: unknown } | null)?.default ?? null;
  return typeof component === "function" ? component : null;
}
