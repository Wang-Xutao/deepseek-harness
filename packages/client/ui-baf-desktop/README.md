# @deepseek-ai/dsh-client-ui-baf-desktop

English | [中文](README.zh.md)

Desktop chrome for baf-dsh: monochrome Sora mark after the empty-hero headline, optional VS Code / Cursor open buttons in the session header, and a Help footer panel that embeds the MkDocs site at `/help/` (with an open-in-browser action).

## Model Experience

None. This package contributes browser UI only and never reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends provider requests.

## Known Limitations and Deferred Work

- **IDE buttons require the Electron bridge** — without `window.bafDesktop.getIdeTools` the header utilities stay empty.
- **Help site needs static artifacts** — sync `overlay/site` into `apps/web/dist/help/` (`npm run docs:build` or `brand-web` under `overlay`).
- **Open in browser** — desktop uses `window.bafDesktop.openExternal`; plain browser uses `window.open`.
