// Minimal Chrome DevTools Protocol driver (Node 22+, no dependencies) used to take the README screenshots.
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launch({ chrome, port = 9400 + Math.floor(Math.random() * 500), width = 1440, height = 900 }) {
  const profile = mkdtempSync(join(tmpdir(), "tabularis-shot-"));
  const child = spawn(
    chrome,
    [
      "--headless=new",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      `--window-size=${width},${height}`,
      "--hide-scrollbars",
      "--force-device-scale-factor=1",
      "--no-first-run",
      "--disable-gpu",
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  let target;
  for (let i = 0; i < 50 && !target; i++) {
    await sleep(200);
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      target = list.find((t) => t.type === "page");
    } catch {
      /* not up yet */
    }
  }
  if (!target) throw new Error("Chrome did not start");
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  let id = 0;
  const pending = new Map();
  const logs = [];
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    } else if (msg.method === "Runtime.consoleAPICalled") {
      logs.push(`${msg.params.type}: ${msg.params.args.map((a) => a.value ?? a.description ?? "").join(" ")}`);
    } else if (msg.method === "Runtime.exceptionThrown") {
      logs.push(`EXCEPTION: ${msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text}`);
    }
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const n = ++id;
      pending.set(n, { resolve, reject });
      ws.send(JSON.stringify({ id: n, method, params }));
    });

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });

  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? "evaluate failed");
    return r.result.value;
  };

  return {
    logs,
    send,
    evaluate,
    async addInitScript(source) {
      await send("Page.addScriptToEvaluateOnNewDocument", { source });
    },
    async goto(url) {
      await send("Page.navigate", { url });
      await sleep(Number(process.env.SHOT_WAIT || 2500));
    },
    sleep,
    /** Clicks the first visible element whose text contains `text` (optionally within `selector`). */
    async clickText(text, selector = "button, a, [role=button], [role=menuitem], div, span") {
      const ok = await evaluate(`(() => {
        const wanted = ${JSON.stringify(text)};
        const nodes = [...document.querySelectorAll(${JSON.stringify(selector)})]
          .filter((n) => n.offsetParent !== null && (n.textContent || '').trim().includes(wanted));
        // innermost match first
        nodes.sort((a, b) => (a.textContent || '').length - (b.textContent || '').length);
        const el = nodes[0];
        if (!el) return false;
        el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        return true;
      })()`);
      if (!ok) throw new Error(`clickText: nothing visible contains "${text}"`);
      await sleep(900);
    },
    async doubleClickText(text) {
      const ok = await evaluate(`(() => {
        const wanted = ${JSON.stringify(text)};
        const nodes = [...document.querySelectorAll('div, span, p, h3')]
          .filter((n) => n.offsetParent !== null && (n.textContent || '').trim().includes(wanted));
        nodes.sort((a, b) => (a.textContent || '').length - (b.textContent || '').length);
        const el = nodes[0];
        if (!el) return false;
        el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
        return true;
      })()`);
      if (!ok) throw new Error(`doubleClickText: nothing visible contains "${text}"`);
      await sleep(1500);
    },
    /** Real mouse input at the centre of the smallest visible element containing `text`. */
    async mouseOnText(text, { button = "left", clicks = 1 } = {}) {
      const box = await evaluate(`(() => {
        const wanted = ${JSON.stringify(text)};
        const nodes = [...document.querySelectorAll('div, span, p, h3, button, a')]
          .filter((n) => n.offsetParent !== null && (n.textContent || '').trim().includes(wanted));
        nodes.sort((a, b) => (a.textContent || '').length - (b.textContent || '').length);
        const el = nodes[0];
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.left + Math.min(r.width / 2, 40), y: r.top + r.height / 2 };
      })()`);
      if (!box) throw new Error(`mouseOnText: nothing visible contains "${text}"`);
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: box.x, y: box.y });
      for (let n = 1; n <= clicks; n++) {
        await send("Input.dispatchMouseEvent", { type: "mousePressed", x: box.x, y: box.y, button, clickCount: n });
        await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: box.x, y: box.y, button, clickCount: n });
      }
      await sleep(1200);
    },
    async key(key, modifiers = {}) {
      const mods = (modifiers.ctrl ? 2 : 0) | (modifiers.shift ? 8 : 0) | (modifiers.alt ? 1 : 0);
      const base = { key, code: modifiers.code ?? key, modifiers: mods, windowsVirtualKeyCode: modifiers.vk ?? 0 };
      await send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...base });
      await send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
      await sleep(700);
    },
    async screenshot(path) {
      const r = await send("Page.captureScreenshot", { format: "png" });
      writeFileSync(path, Buffer.from(r.data, "base64"));
    },
    close() {
      try {
        ws.close();
        child.kill();
      } catch {
        /* already gone */
      }
    },
  };
}

export const readText = (p) => readFileSync(p, "utf8");
