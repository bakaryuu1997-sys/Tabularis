// Stand-in for the Tauri backend so the web UI can run in a plain browser for README screenshots.
// `window.__MOCK_HANDLERS__` (defined by mock-data.js, loaded after this file) maps command names to results.
(() => {
  const calls = [];
  window.__MOCK_CALLS__ = calls;
  let callbackId = 1;
  window.__TAURI_INTERNALS__ = {
    metadata: {
      currentWindow: { label: "main" },
      currentWebview: { windowLabel: "main", label: "main" },
    },
    transformCallback(cb) {
      const id = callbackId++;
      window[`_cb${id}`] = cb;
      return id;
    },
    unregisterCallback() {},
    convertFileSrc: (p) => p,
    async invoke(cmd, args) {
      calls.push(cmd);
      const handlers = window.__MOCK_HANDLERS__ || {};
      if (cmd in handlers) {
        const h = handlers[cmd];
        return typeof h === "function" ? h(args || {}) : h;
      }
      if (cmd.startsWith("plugin:event|listen")) return callbackId++;
      if (cmd.startsWith("plugin:")) return null;
      console.warn("UNMOCKED " + cmd + " " + JSON.stringify(args || {}).slice(0, 120));
      return null;
    },
  };
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
})();
