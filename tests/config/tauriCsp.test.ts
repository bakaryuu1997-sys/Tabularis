import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("Tauri CSP configuration (T1 regression)", () => {
  const tauriConfPath = path.resolve(__dirname, "../../src-tauri/tauri.conf.json");
  const indexHtmlPath = path.resolve(__dirname, "../../index.html");

  it("tauri.conf.json exists and defines a security policy allowing unsafe-inline styles", () => {
    const raw = fs.readFileSync(tauriConfPath, "utf-8");
    const conf = JSON.parse(raw);

    const security = conf?.app?.security;
    expect(security).toBeDefined();

    // Verify style-src contains 'unsafe-inline' so Monaco Editor runtime styles are permitted
    expect(security.csp).toContain("style-src 'self' 'unsafe-inline'");
    expect(security.devCsp).toContain("style-src 'self' 'unsafe-inline'");
  });

  it("disables Tauri asset CSP modification for style-src so build hashes do not invalidate unsafe-inline", () => {
    const raw = fs.readFileSync(tauriConfPath, "utf-8");
    const conf = JSON.parse(raw);

    const disabledList = conf?.app?.security?.dangerousDisableAssetCspModification;
    expect(disabledList).toBeDefined();
    expect(Array.isArray(disabledList)).toBe(true);
    expect(disabledList).toContain("style-src");
  });

  it("index.html must not contain inline <style> blocks that trigger CSP asset hashing", () => {
    const html = fs.readFileSync(indexHtmlPath, "utf-8");
    // Ensure no <style> tag exists in index.html
    expect(html).not.toMatch(/<style\b[^>]*>/i);
  });
});
