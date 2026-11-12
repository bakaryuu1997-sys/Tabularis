# README screenshots

Generates the images in `assets/screenshots` without a database or a desktop session.

- `mock-core.js` replaces the Tauri bridge (`window.__TAURI_INTERNALS__`) in a plain browser.
- `mock-data.js` holds invented demo data (connections, tables, rows, comments). Edit it to change what the screenshots show.
- `cdp.mjs` is a small dependency-free Chrome DevTools Protocol driver (Node 22+).
- `capture.mjs` walks through the screens and saves the PNG files.
- `spa-server.py` serves a built frontend with single-page-app fallback.
- `run.sh` runs `capture.mjs` with Windows Chrome and Node from WSL (adapt the paths for other setups).

Steps: build the frontend (`vite build --outDir <dir>`), serve it with `spa-server.py <dir> 5181`, then run `./run.sh http://localhost:5181`.
