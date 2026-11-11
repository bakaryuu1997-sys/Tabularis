import { describe, expect, it } from "vitest";
import { evaluatePluginBundle } from "../../src/utils/pluginRuntime";

describe("evaluatePluginBundle", () => {
  it("returns a component exported directly", () => {
    const component = evaluatePluginBundle(
      "var __tabularis_plugin__ = (function(){ return function Direct(){ return null; }; })();",
      {},
    );
    expect(typeof component).toBe("function");
    expect((component as { name: string }).name).toBe("Direct");
  });

  it("returns the default export of an ES-module style bundle", () => {
    const component = evaluatePluginBundle(
      "var __tabularis_plugin__ = { default: function Esm(){ return null; } };",
      {},
    );
    expect((component as { name: string }).name).toBe("Esm");
  });

  it("returns null when the bundle exports no component", () => {
    expect(evaluatePluginBundle("var other = 1;", {})).toBeNull();
    expect(evaluatePluginBundle("var __tabularis_plugin__ = { notDefault: 1 };", {})).toBeNull();
    expect(evaluatePluginBundle("var __tabularis_plugin__ = 42;", {})).toBeNull();
  });

  it("hands the bundle the API object it was given as __TABULARIS_API__", () => {
    const api = { marker: "plugin-specific" };
    const component = evaluatePluginBundle(
      "var __tabularis_plugin__ = function(){ return __TABULARIS_API__.marker; };",
      api,
    ) as () => string;
    expect(component()).toBe("plugin-specific");
  });

  it("gives two plugins two different API objects", () => {
    const source = "var __tabularis_plugin__ = function(){ return __TABULARIS_API__; };";
    const a = { id: "a" };
    const b = { id: "b" };
    expect((evaluatePluginBundle(source, a) as () => unknown)()).toBe(a);
    expect((evaluatePluginBundle(source, b) as () => unknown)()).toBe(b);
  });

  it("passes React to the bundle", () => {
    const component = evaluatePluginBundle(
      "var __tabularis_plugin__ = function(){ return typeof React.createElement; };",
      {},
    ) as () => string;
    expect(component()).toBe("function");
  });

  it("throws on a syntax error so the loader can skip the plugin", () => {
    expect(() => evaluatePluginBundle("var __tabularis_plugin__ = ;", {})).toThrow();
  });
});
