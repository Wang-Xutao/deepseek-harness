# Agent Note: Batch 25 (2026-10-25) — the sidebar launcher keeps its icon, the composer tidy-up really optimizes the input, the two 工作流 pages shed their gold, and three capability plugins enter the recommended list

Status: implemented

## Problem

One request carried six complaints about the baf-dsh desktop build. Three of them were about how the product *reads*; three were about what it can *do*.

1. **The「自动化任务」launcher lost its icon when it moved into「更多」.** Batch 24 moved the launcher out of the rail, and the More menu rendered the row as a bare label. The row in the rail and the row in the menu are the same launcher, so the menu row must carry the same glyph — a launcher that changes its face when it changes its place reads as a different object.
2. **「格式化输入」had no effect.** The control had been given a model path in batch 24, but the user pressed it and saw nothing change. Two causes sat on top of each other: the system prompt forbade exactly what the user wanted (*"只调整结构与断句，不改写、不润色"*, plus *"若草稿本身已经清晰，就原样返回"*), and the route resolver read the agent's live options — accessors over the deployment's **default** model — before the session's own selection, with no answer at all for a session sitting on the BAF「自动」pseudo route. A silent fallback then made every outcome look identical.
3. **The 确认门 and 变更总览 pages were too heavy.** The user singled out the「需求输入」node: it was a solid gold slab, the heaviest thing on the page. The rest of both pages followed the same logic — gold was used as a *fill* (a 26% hero wash, 42% accent lines, 55% glows) instead of as an accent, so the pages read as one loud gold field rather than as two ledgers.
4. **The BAF workflow had no code-base index.** The user asked for code indexing with context awareness, so the agent understands the codebase's structure and gives more accurate, more relevant suggestions — and asked to check first whether a mature open-source DSH plugin exists.
5. **There was no C language LSP.** The user asked to check for an open-source plugin and put it in the recommended list.
6. **There was no experience/memory layer.** The user asked the same for「经验沉淀和记忆」, and asked for the advantages of all three recommendations.

## Decision

### 1. The More menu draws the launcher's own icon, lazily

`SidebarPanelActionEntry` (the contract `ui-sidebar` hands the More menu) grew one optional field: `readonly icon?: () => ReactNode`. The **shell** owns the icon — it is the `sidebar.panellist` registrant — so the shell hands the row a *renderer*, not a node: a node would instantiate every panel's icon even for the rows the menu never draws. `SidebarRoot` fills it with `renderSlot('sidebar.panellist', { size: 16, active }, { only: id })`, the very call the rail row makes; `EntryMenuContent` passes `entry.icon?.()` into the existing `MenuItemButton` `icon` prop, which renders into the menu's `css.itemIcon` slot.

The glyph is not a new asset: it is the same registration, the same component and the same size rule the rail uses, so a launcher that moves keeps its face for free.

### 2. The tidy-up optimizes the content, resolves the right route, and says what happened

**The prompt.** `DRAFT_FORMAT_SYSTEM` now asks for two jobs at once: structure the draft into a requirement brief (目标 / 背景 / 需求明细 / 约束 / 交付与验收, the sections the author actually supplied), *and* make the author's own words more precise, more specific and less ambiguous. The hard bans survive verbatim — no new fact, requirement, command, path, number or example; no widening of scope; code, commands, errors, paths and identifiers stay verbatim; the author's language stays; genuinely undecidable spots are marked `（待确认：…）` at most three times.

**The route.** `resolveDraftRoute` (extracted from the Remote so it can be tested) now resolves in the order the agent loop itself uses:

1. the session's **recorded selection** — the `modelSelection` projection's view (`next`, else `lastUsed`), i.e. the model the user picked;
2. the agent's **live route options** — the route a fresh session starts on;
3. the session's **last request header** — the route that actually ran;
4. the cold log's last header epoch — the last resort for a session whose agent is gone.

Every candidate goes through the deployment's **per-step route resolver** first (`ctx.get('stepRouteResolver')`, the same seam `dsh-agent-loop` reads), so the BAF「自动」pseudo pair maps to the tier route the step would use — and the pseudo pair itself is never handed to a provider. The resolver's service is read structurally and best-effort: a deployment without one keeps the recorded route.

**The outcome.** The control now says what answered. The injected face returns `{ text, model }`, and the button carries a `data-baf-draft-format-notice` of `optimized` (the model rewrote the draft, and its name is in the tooltip), `local` (no model answered; the local arranger did), `same` (the model echoed the author's text) or `changed` (the author typed while the model worked). A silent fallback can no longer read as「模型没生效」.

**Where the outcome shows.** The tooltip is a hover surface, and the user filed「没有效果」precisely because a quiet result looks like no result. So the outcome also reaches the **app-wide Toast**: the control publishes it to a plugin-level store, and a `shell.overlay` entry (`baf-desktop.draft-format-toast`) renders the `Toast` — the frame-wide layer, which outlives the composer that produced it. A toast rendered inside the composer would vanish with it; the overlay's host does not. The model that answered is named in the banner; the local fallback carries a warning glyph, because the user asked for the model.

### 3. The two 工作流 pages lose their gold coverage

The hue is untouched — it is the same BAF gold the rest of the surface uses. What changed is **how much of it there is**: every gold fill became a trace, and every gold border became a hairline. The hero wash 26%→11%, the console sheen 11%→5%, the selected ring 26%→15% with its glow 55%→26%, card edges 72%→38%, the progress and state chips halved, the gate card's 3px gold bar became a 2px one, and the ambient canvas washes dropped to a trace.

The「需求输入」node — the item the user singled out — stops being a solid gold slab: it is a light surface with a gold hairline and a faint gold ring, its ink following the surface (`--wf-accent-text`) because the gold fill it used to sit on is gone. Its place in the entrance order and its glyph are unchanged, so the node still reads as the page's first mark — one weight down.

### 4–6. Three capability plugins enter the recommended list, with their advantages stated

The manifest (`overlay/plugin/featured-plugins.json`) went from revision 2 to revision 3. Each entry's package, version, license, peer range and monthly download count were checked against the npm registry before the entry was written; the reasons live in the help page (`overlay/docs/help/featured-plugins.md`) and the engineering note (`overlay/docs/baf/capability-plugins.md`).

- **代码库索引** → `@lovedolove/dsh-codebase-memory-mcp` v0.1.4 (MIT, 1,045 downloads/month). A knowledge-graph index over the workspace: symbol and snippet search, call-path tracing, an architecture overview. Upstream `DeusData/codebase-memory-mcp` is MIT with 47k stars and daily commits. The plugin exposes **native DSH tools**, not an MCP round-trip, and ships a graph UI plus a `/cbm` status command. *Risk the card states:* it is a bridge — the native `codebase-memory-mcp` binary must be installed separately, or the plugin registers no tools at all.
- **C 语言 LSP** → `dsh-code-navigator` v0.1.0 (MIT, 998/month). clangd wired in: go-to-definition, find-references, implementations and hover. The upstream `packages/lsp` seam is provider-neutral, so switching language servers does not change the model-side protocol; `finalExtension()` already splits on both path separators, so Windows paths work. *Risks the card states:* clangd is not shipped (it must be installed and on PATH), and the upstream `lsp` covers four **read-only** operations — diagnostics, formatting and rename need a diagnostics plugin.
- **经验沉淀与记忆** → `@openviking/dsh-memory-plugin` v0.5.29 (Apache-2.0, **36,584/month** — the most used in the community) plus `@jacklika/dsh-memory` v0.1.7-rc.40 (MIT, 3,870/month) for the curator pattern: recall before acting, capture after significant work, conflict detection and optional human approval, over an Obsidian-compatible Markdown vault that is readable, versionable and offline.

Two plugins are **not** recommended on purpose: Serena and `aoci-code` carry GitHub license `NOASSERTION` (not an OSI license), which is an authorization risk for a commercial product.

## Alternatives considered

- **Keep the More menu row label-only.** Rejected: the menu row is the same launcher, and a row that loses its glyph when it moves is the complaint the user filed. Drawing the registered icon costs one lazy renderer, not a new asset.
- **Put the icon node (not a renderer) on the entry.** Rejected: a node would instantiate every panel's icon when the More menu builds its rows, including panels the menu never shows.
- **Keep the structure-only prompt and only fix the route.** Rejected: the user's complaint was not that the button did nothing — it was that it "only formats the input" and does not "optimize the content of the input". A route fix alone would have kept the model forbidden from doing the job.
- **Add a second, explicit "optimize" mode next to "format".** Rejected: the user asked for one implicit control ("implicitly bring in the large model"), and two buttons would make the user choose a mode they cannot evaluate.
- **Keep the outcome inside the control's tooltip.** Rejected: a tooltip is a hover surface, and the user's complaint was that a quiet result looks like no result. The outcome is a transient operation outcome, so it belongs in the app-wide Toast whose host outlives the composer.
- **Resolve the route from the agent's options only, plus a hardcoded provider.** Rejected: the options are accessors over the deployment's *default* model, so the call would ignore the model the user actually selected.
- **Call the auto pseudo route directly.** Rejected: `{baf-route, auto}` is not a provider route; the agent loop maps it per step through the route resolver, and the formatter must use the same mapping.
- **Keep the gold hue and only lighten the fills.** Rejected: the hue is the product's identity (it is the same gold as the rest of the 工作流 surface). The complaint was the *coverage*, so the coverage is what changed.
- **Rebuild the two pages from scratch.** Rejected: the pages' structure and hierarchy are good; only their colour weight was wrong. A rewrite would have thrown away the batch-24 work the user had just approved.
- **Implement the code index in-house.** Deferred, not rejected: a mature plugin exists, so the user's own rule puts it in the recommended list. The full in-house plan (parse → index → graph → context assembly → tools → workflow wiring) is written up in `overlay/docs/baf/capability-plugins.md` as the fallback path if the plugin is withdrawn, and the product-side gap the plugin does not close — the native binary's distribution, versioning and daemon lifecycle on the desktop — is recorded there too.
- **Recommend only one memory plugin.** Rejected: the most-used plugin (36.6k/month) and the curator-pattern plugin answer different halves of「经验沉淀与记忆」 — one is about remembering, the other about distilling experience deliberately. Both are recommended, and the help page says which is which.

## Testing

- `pnpm run build:artifacts` — 8 gates green.
- `pnpm run build:check` — 2 gates green.
- `npx vitest run packages/client/ui-baf-workflow packages/client/ui-baf-desktop` — 176 cases green (15 workflow files + the desktop files), including **11 new host cases** for `resolveDraftRoute` (recorded selection wins over the live options; the last-used selection when nothing is pending; the live options when no selection was recorded; the last request header when neither exists; the auto pseudo pair mapped through the resolver; the pseudo pair never answered; the cold-log fallback; no route at all) and **11 new client cases** for the visible outcome (three for the four-state notice on the control, two for publishing it, six for the app-wide toast's rendering and dismissal).
- `npx vitest run packages/client/ui-sidebar packages/client/ui-entry-customization` — 1209 cases green (one pre-existing failure in `ui-sidebar-documentpreview`: its bundled-license case needs built artifacts), including the two new icon assertions (the More row draws the rail's own 16px glyph; the menu row renders the icon the shell hands it).
- `npx vitest run packages/baf/baf-featured` — 37 cases green, including the manifest checks that lock revision 3, the six-entry id list and each new entry's package, range, mirror and peer-exemption shape.
- Web walkthrough (`overlay/scripts/probe-batch25-web.mjs`, headless Edge over CDP): every assertion green — the More row's 16px launcher glyph, the 需求输入 node's computed surface (no gradient wash, no gold fill, a hairline edge, no glow, weight 600), both pages' measured gold coverage (0 large gold plates, 0% of the page), the four-state notice on the control, the app-wide toast's text, and the six recommended-plugin cards with the four new ids.
- Desktop walkthrough (`overlay/scripts/probe-batch25-exe-ui.mjs`, `baf-dsh.exe` over CDP): every assertion green.
- `pnpm run verify-agent-note-format` and `pnpm run verify-agent-note-classification` — this note passes.
- Pre-existing failures on this branch, untouched by this batch: `verify-type-equiv` (three `llm-streaming.md` type drifts), `verify-translation-pairing` (packages without `README.i18n.yaml`), `verify-package-readme-model-experience` / `verify-package-readme-limitations` (baf-* packages), `verify-agent-note-format` over ~50 early BAF notes, five `ui-conversation` `chat-apply` cases (duplicate remote-service registration) and one `ui-sidebar-documentpreview` case.

## Consequences

- The More menu now costs one icon render per visible row instead of none. The renderer is lazy, so a menu that shows no launcher pays nothing.
- The tidy-up's model call can now answer with a rewritten draft that differs from the author's wording. The revert action still restores the author's exact text, and the draft is never sent — the control writes into the composer only.
- `DRAFT_FORMAT_SYSTEM` changed shape: any test or prompt that asserted the old「only adjust structure」wording would fail. The host spec pins the new wording instead (it asserts that the old prohibition is *gone* and that the fact ban survived).
- The `formatWithModel` injected face changed its return type from `string | undefined` to `{ text, model } | undefined`. The bridge in `ui-baf-desktop` and the client spec were updated together.
- The composer control grew a `notifyOutcome` callback and the plugin a `DraftFormatNoticeController`; the outcome now reaches the frame-wide `shell.overlay` toast. `ui-baf-desktop` therefore depends on `@deepseek-ai/dsh-client-ui-layout` (the seat's owner) and lists it in `dsh.client.inject`, so the hole exists before the plugin registers into it.
- The two 工作流 pages are now noticeably lighter: the gold survives as hairlines, markers and numbers. If the gold reads too faint on a specific surface, the fix is to raise that one rule's percentage, not to bring the fills back.
- The recommended list grows by four entries, so the settings page's 推荐插件 section is longer. The manifest's `registryFirst` keeps every install on the China mirror, and `peerExemptionExpected` marks the two entries whose peer ranges do not fit this runtime (so their first install asks for the one-time compatibility card).
- `overlay/docs/baf/capability-plugins.md` records the npm facts (versions, licenses, peer ranges, download counts) as of 2026-10-25. They age; the file says so, and the download counts are the number to re-check before the next release.
