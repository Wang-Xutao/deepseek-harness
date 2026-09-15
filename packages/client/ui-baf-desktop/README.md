# @deepseek-ai/dsh-client-ui-baf-desktop

English | [中文](README.zh.md)

Desktop chrome for baf-dsh: monochrome Sora mark after the empty-hero headline, baf-dsh branded title row (overrides `ui-brand-official`'s upstream wordmark), and a Help footer panel that embeds the MkDocs site at `/help/` (with an open-in-browser action).

No runtime invariant companion is published because this package is presentation-only chrome over desktop IPC; it owns no diverging runtime observations.

## Model Experience

None. This package contributes browser UI only and never reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends provider requests.

## Known Limitations and Deferred Work

- **Branded title overrides upstream wordmark** — `ui-brand-official` registers "DeepSeek Harness" under `sidebar.brand.name`; baf-desktop activates after it and registers `baf-dsh v0.0.14` so the title row reads correctly. Bump `overlay/desktop/VERSION` in lockstep.
- **Help site needs static artifacts** — sync `overlay/site` into `apps/web/dist/help/` (`npm run docs:build` or `brand-web` under `overlay`).
- **Open in browser** — desktop uses `window.bafDesktop.openExternal`; plain browser uses `window.open`.
