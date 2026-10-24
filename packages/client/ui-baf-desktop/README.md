# @deepseek-ai/dsh-client-ui-baf-desktop

English | [中文](README.zh.md)

Desktop chrome for baf-dsh: monochrome Sora mark after the empty-hero headline, baf-dsh branded title row (overrides `ui-brand-official`'s upstream wordmark), a Help footer panel that embeds the MkDocs site at `/help/` (with an open-in-browser action), and a composer tidy-up control.

No runtime invariant companion is published because this package is presentation-only chrome over desktop IPC; it owns no diverging runtime observations.

## Composer tidy-up control

The control sits in the composer's right cluster, before the model selector and the send action. It arranges the current draft into Markdown structure with a local deterministic formatter — paragraphs, bullet lists, fenced code — and never rewrites, reorders, or drops a word of the author's text. The same draft always yields the same result: no model call, no network, no clock. While a formatted draft can be restored, the control shows the revert action; pressing it restores the author's original wording.

## Model Experience

None. This package contributes browser UI only and never reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends provider requests.

## Known Limitations and Deferred Work

- **Branded title overrides upstream wordmark** — `ui-brand-official` registers "DeepSeek Harness" under `sidebar.brand.name`; baf-desktop activates after it and registers `baf-dsh v0.0.14` so the title row reads correctly. Bump `overlay/desktop/VERSION` in lockstep.
- **Help site needs static artifacts** — sync `overlay/site` into `apps/web/dist/help/` (`npm run docs:build` or `brand-web` under `overlay`).
- **Open in browser** — desktop uses `window.bafDesktop.openExternal`; plain browser uses `window.open`.
- **A draft with @ file references is left alone** — the composer writes the draft as plain text, which would drop the reference chips the author attached. The control stays visible but refuses the draft and says why.
