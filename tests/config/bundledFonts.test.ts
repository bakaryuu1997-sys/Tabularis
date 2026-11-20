import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, "../..", rel), "utf-8");

describe("bundled fonts", () => {
  it("are not @import-ed from index.css (Tailwind does not rebase their url()s)", () => {
    expect(read("src/index.css")).not.toMatch(/@import\s+["']@fontsource\//);
  });

  it("are imported from src/fonts.ts, which the app entry loads", () => {
    const fonts = read("src/fonts.ts");
    expect(fonts).toContain('import "@fontsource/inter/400.css";');
    expect(fonts).toContain('import "@fontsource/jetbrains-mono/400.css";');
    expect(read("src/main.tsx")).toMatch(/import ['"]\.\/fonts['"];/);
  });
});
