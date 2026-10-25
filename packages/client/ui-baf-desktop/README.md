# @deepseek-ai/dsh-client-ui-baf-desktop

English | [中文](README.zh.md)

Desktop chrome for baf-dsh: monochrome Sora mark after the empty-hero headline, baf-dsh branded title row (overrides `ui-brand-official`'s upstream wordmark), a Help footer panel that embeds the MkDocs site at `/help/` (with an open-in-browser action), a composer tidy-up control, and the desktop notifications that call the user back to a Session.

No runtime invariant companion is published because this package is presentation-only chrome over desktop IPC; it owns no diverging runtime observations.

## Desktop notifications

The three states that need the user away from the window each raise one operating-system toast: a task that **finished**, a task that **failed**, and a task that **waits on the user** (a tool approval, a question, a plan review). The toast's bold line says what happened and its body line names the Session; clicking the toast reveals the window, which is the point of the reminder when the app sits in the tray.

The renderer is the only party that sees the Session lifecycle, so it reports the event; the **desktop shell decides whether to show it** — the `desktopNotifications` preference is the switch, and the shell owns it, so flipping the setting in General settings takes effect without a reload. Outside Electron there is no toast at all.

A stopped turn is not yet a settled outcome: the Agent reports the failure and the running state drops in the same breath, in either order. The controller therefore settles a turn once, after a short window, and reports the failure instead of the completion when the failure arrived — one turn produces exactly one toast, and it names the failure.

The observer lives in the frame-wide `shell.overlay` layer, so it sees every Session in the list — not only the open one — and it renders nothing: the toast belongs to the operating system, not to the page.

## In-app update prompt

When the desktop shell finds an update, the app draws the prompt itself. The operating system's message box used to do it, and it looked like a stranger in a product that paints every other surface itself; the prompt is now the app's own dialog — the same mask, the same card, the same buttons as every other dialog in the product.

The split follows the product's grain: **the shell decides, the app draws.** The shell knows which scope prompted and whether the update is required; it hands the renderer the facts (the scope summary, the release notes, the target version) and keeps them until the next prompt, so a renderer that mounted late still finds one. The renderer owns the drawing and the three answers.

Two variants, one surface. An optional update offers 「立即更新」 and 「稍后更新」 — the mask, the Escape key and the close button all dismiss it. A required update (a forced security release, or a minimum shell version above the installed one) says 「必须更新后才能继续使用」, offers 「立即更新」 and 「退出应用」, and **refuses every dismissal path**: there is no close button, and Escape does nothing. The old version must not keep running.

The release notes read as one point per paragraph, so the user scans a list instead of a wall of text.

Applying the update stays the shell's work: the progress arrives as a push, the outcome arrives in the reply, and a failure keeps the dialog open with the reason — so the user can retry, or quit, when the update was required.

## Composer tidy-up control

The control sits in the composer's right cluster, before the model selector and the send action. It turns the current draft into a structured requirement brief — headings, bullet lists, fenced code — **and optimizes the wording the author already wrote**: the request makes the draft's intent more precise, more specific and less ambiguous. It never adds a fact, a requirement, a command, a path or a number the draft does not carry, and it never widens the scope; a spot that is genuinely undecidable is marked 「（待确认）」 rather than decided for the author.

The arrangement runs on **the session's own model** — the model the user picked, resolved in the same order the agent loop resolves a step (the session's recorded selection, then the agent's live route options, then the last request header), with the deployment's per-step route resolver mapping the BAF「自动」pseudo route to the tier route a step would use. The control asks the Host to arrange the draft in one auxiliary request (`purpose: 'draft-format'`); the draft rides in as the only input, and the answer passes a sanitizer (wrapping fences, courtesy lines, blank-line runs) before it reaches the draft. The user configures nothing: the model is the one they are already talking to.

When no model answers — the session has not routed a model yet, the provider failed, or the answer came back empty — the control **falls back to a local deterministic arranger**: paragraphs, bullet lists, fenced code, never rewriting a word, and always the same result for the same draft. The fallback is what makes the control safe: a chatty or failing model degrades to "no change", never to a corrupted draft.

The control also says **which of the two answered**: the outcome reaches an app-wide toast (the frame-wide `shell.overlay` layer, which outlives the composer) and the control's own tooltip names it — the model that optimized the draft, or the fact that the local rules answered, or that the model read the draft and found nothing to change. A silent fallback is exactly what 「模型没生效」 looks like, so the outcome is always visible without the pointer having to rest on the control.

While the model works, the control shows a spinner and says so. If the author edits the draft during the call, the answer is discarded — the author's words win.

While a formatted draft can be restored, the control shows the revert action; pressing it restores the author's original wording.

The two states read as one object with two annotations: the same document, with a pen while it is being arranged (`list-pen-outline`) and a solid left-pointing arrow while it can be restored (`undo-doc-outline`, a glyph this batch added to the platform icon set) — same weight, same fill language, same document contour. The tidy-up state hovers as "格式化输入" / "Format the input"; the revert state states the consequence ("还原美化前的原文", and "会丢弃美化之后的修改" once the author edits again after the tidy-up).

## Model Experience

### Composer tidy-up request

#### What the model sees

The author's draft, as the single user message of one auxiliary request, under the fixed `DRAFT_FORMAT_SYSTEM` prompt. Nothing else from the session enters the request, and the arranged answer is not written back into the session log — the composer persists the draft, so the session log still reconstructs exactly what the model saw.

#### Token effect

One auxiliary request per press (`purpose: 'draft-format'`), capped at `DRAFT_FORMAT_MAX_TOKENS` output tokens and sent on the session's current route, so no second provider and no second key are involved. A press that finds no routed model sends nothing at all.

#### KV Cache effect

The request carries a fixed system prompt and one user message with no session prefix, so it neither reads nor writes a session-scoped cache; the fixed prompt is a stable prefix a provider may cache on its own.

## Known Limitations and Deferred Work

- **Branded title overrides upstream wordmark** — `ui-brand-official` registers "DeepSeek Harness" under `sidebar.brand.name`; baf-desktop activates after it and registers `baf-dsh v0.0.14` so the title row reads correctly. Bump `overlay/desktop/VERSION` in lockstep.
- **Help site needs static artifacts** — sync `overlay/site` into `apps/web/dist/help/` (`npm run docs:build` or `brand-web` under `overlay`).
- **Open in browser** — desktop uses `window.bafDesktop.openExternal`; plain browser uses `window.open`.
- **A draft with @ file references is left alone** — the composer writes the draft as plain text, which would drop the reference chips the author attached. The control stays visible but refuses the draft and says why.
- **The tidy-up spends a model call** — arranging a draft now sends one auxiliary request on the session's own route, so it spends that provider's tokens and takes as long as the model takes. The local arranger answers only when no model is reachable, so a press is not free when a model is.
- **The arrangement is one snapshot** — pressing the control twice does not undo the first arrangement; the revert action restores the text as it stood before the first tidy-up.
