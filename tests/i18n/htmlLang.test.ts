import { describe, it, expect } from "vitest";
import i18n from "i18next";
import "../../src/i18n/config";

describe("html lang follows the UI language", () => {
  it("updates <html lang> when the language changes", async () => {
    await i18n.changeLanguage("vi");
    expect(document.documentElement.lang).toBe("vi");
    await i18n.changeLanguage("ja");
    expect(document.documentElement.lang).toBe("ja");
    await i18n.changeLanguage("en");
    expect(document.documentElement.lang).toBe("en");
  });
});
