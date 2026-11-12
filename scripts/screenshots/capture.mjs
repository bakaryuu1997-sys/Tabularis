// Takes the README screenshots from the built frontend with a mocked backend.
// Usage: node capture.mjs <chrome.exe> <base-url> <output-dir>
import { launch, readText } from "./cdp.mjs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const [, , chrome, baseUrl, outDir] = process.argv;
const here = dirname(fileURLToPath(import.meta.url));
const page = await launch({ chrome, width: 1440, height: 900 });
await page.addInitScript(readText(join(here, "mock-core.js")) + "\n" + readText(join(here, "mock-data.js")));

const shot = async (name) => {
  await page.sleep(800);
  await page.screenshot(join(outDir, `${name}.png`));
  console.log("saved", name);
};

try {
  // 1. Connections
  await page.goto(`${baseUrl}/connections`);
  await shot("01-connections");

  // 2. Open a connection and a table
  await page.doubleClickText("Shop · Staging");
  await page.sleep(3000);
  await page.mouseOnText("customers", { clicks: 2 });
  await page.sleep(2500);
  await shot("02-data-grid");

  // 3. Table context menu (shows the new "Table definitions..." entry)
  await page.mouseOnText("customers", { button: "right" });
  await shot("03-context-menu");
  await page.key("Escape");
  await page.evaluate("document.body.click()");

  // 4. Table definition dialog, after exporting
  await page.evaluate("window.dispatchEvent(new CustomEvent('tabularis:open-table-spec', { detail: { tableName: 'customers' } }))");
  await page.sleep(800);
  await page.clickText("Export to Excel");
  await page.sleep(1500);
  await shot("04-table-definition");
  await page.clickText("Close");

  // 5. Presentation mode
  await page.clickText("Presentation mode");
  await page.sleep(1200);
  await shot("05-presentation-mode");
  console.log(page.logs.filter((l) => !l.includes("save_config")).slice(0, 25).join("\n"));
} catch (e) {
  console.error("FAILED:", e.message);
  console.log(page.logs.slice(0, 30).join("\n"));
} finally {
  page.close();
  process.exit(0);
}
