import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import en from "../../src/i18n/locales/en.json";
import ja from "../../src/i18n/locales/ja.json";
import vi from "../../src/i18n/locales/vi.json";

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") out[path] = value;
    else Object.assign(out, flatten(value, path));
  }
  return out;
}

const LOCALES = { en: flatten(en as Tree), ja: flatten(ja as Tree), vi: flatten(vi as Tree) };
const placeholders = (text: string) => [...text.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map((m) => m[1]).sort();

const SRC_ROOT = join(__dirname, "../../src");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === "locales" ? [] : sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

const VIETNAMESE =
  /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i;

/** Intentional exceptions: a language's own name, and the legacy title written by older versions. */
const VIETNAMESE_ALLOWLIST = new Set([
  "src/i18n/config.ts",
  "src/components/ai/AiChatWidget.tsx",
  "src/components/modals/UserGuideModal.tsx",
]);

describe("locale files", () => {
  it("ship exactly English, Japanese and Vietnamese with the same keys", () => {
    const enKeys = Object.keys(LOCALES.en).sort();
    expect(Object.keys(LOCALES.ja).sort()).toEqual(enKeys);
    expect(Object.keys(LOCALES.vi).sort()).toEqual(enKeys);
  });

  it("use the same interpolation placeholders in every language", () => {
    const mismatches: string[] = [];
    for (const [key, text] of Object.entries(LOCALES.en)) {
      const expected = placeholders(text).join(",");
      for (const lang of ["ja", "vi"] as const) {
        const actual = placeholders(LOCALES[lang][key]).join(",");
        if (actual !== expected) mismatches.push(`${lang}:${key} has {${actual}} but en has {${expected}}`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("have no empty translations", () => {
    const empty = Object.entries(LOCALES).flatMap(([lang, map]) =>
      Object.entries(map)
        .filter(([, text]) => text.trim() === "")
        .map(([key]) => `${lang}:${key}`),
    );
    expect(empty).toEqual([]);
  });
});

describe("source code", () => {
  const files = sourceFiles(SRC_ROOT);

  it("contains no hard-coded Vietnamese text outside the allowlist", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const rel = relative(join(SRC_ROOT, ".."), file).split("\\").join("/");
      if (VIETNAMESE_ALLOWLIST.has(rel)) continue;
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (VIETNAMESE.test(line)) offenders.push(`${rel}:${i + 1}: ${line.trim().slice(0, 80)}`);
        });
    }
    expect(offenders).toEqual([]);
  });

  it("only references translation keys that exist in en.json", () => {
    const known = new Set(Object.keys(LOCALES.en));
    // i18next resolves plural forms from `key_one` / `key_other` etc.
    const exists = (key: string) =>
      known.has(key) || [...known].some((k) => k.startsWith(`${key}_`));
    const missing: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      for (const match of text.matchAll(/(?<![\w.$])t\(\s*["'`]([A-Za-z][\w-]*(?:\.[\w-]+)+)["'`]/g)) {
        if (!exists(match[1])) missing.push(`${relative(SRC_ROOT, file)}: ${match[1]}`);
      }
    }
    expect([...new Set(missing)].sort()).toEqual([]);
  });
});
