# Agent Note: Batch 28 (2026-10-26) — the 工作流 page reads as one family: one spacing, one width, five headers, and a per-script fail-stop switch

Status: implemented

## Problem

The customer asked for five changes to the 工作流 page of the BAF DSH desktop app:

1. Every tab must keep the **same top spacing**, and the page's **maximum width may grow**.
2. In 项目工程, the 「项目信息」/「受保护路径」/「状态脚本」 card titles need a real UI treatment; 「状态脚本」 becomes 「状态进出hook」; the enter/exit scripts must run **in the configured order**; and every script needs a **「失败中止」 switch** — a script that fails abnormally must stop the workflow.
3. The 确认门 and 变更总览 **top bars are too dark** — they should be 清淡优雅.
4. 测试流, 指令集 and 企业规范 need the **same header band and figure row** the 确认门 got.
5. In 变更总览, 「在浏览器中打开」 **does not work**; its label must be **white**; 「正在加载」 needs a **loading animation**; and the change cards need **sorting, category and filtering**.

Five separate surfaces of one page, but the root cause is the same: the 工作流 page grew one surface at a time and never got a shared frame.

## Decision

### One spacing rule, measured on the deepest first element

The page's tab panels share one wrapper (`.rows` → `.rowSlot`), so every tab already started at the same *wrapper* position — but not at the same *content* position. 确认门's flow canvas carried a `margin-top: 12px` of its own, so its content sat 12px lower than the other six tabs.

The rule is now: **the first content element of every tab starts 14px below the tab strip** (2px panel padding + 12px content padding), measured on the deepest visible leaf rather than on the wrapper — a slot's own top margin counts, so a tab cannot hide a margin behind its wrapper. The 确认门 canvas's `margin-top` is gone.

### The column grows to 1180px, and the second cap goes away

`WorkflowPage.module.css` capped the content column at 960px and `WorkflowSection.module.css` capped it again at 760px. The 工作流 page carries the widest content in the product (the 确认门 canvas beside its 门禁明细 column, the ledger's four figure plates, three flow canvases with their detail columns), and the second cap squeezed the *inner* column independently of the outer one.

The outer cap moves to **1180px** and the inner cap is removed. The two caps were fighting each other: raising only the outer one would have left the section at 760px.

### The 项目工程 cards name themselves

The three cards used to carry a bare title, which read as three identical labels. They now share one **card head** (`CardHead`): an inline SVG glyph (info / shield / hook), the title, and **one line of description**. 「状态脚本」 becomes 「状态进出hook」 — the name says what the card holds (the scripts that run on entering and leaving a state), and its description states the rule the customer asked about: *进入 / 退出状态时执行的脚本，按配置先后顺序执行*.

### The fail-stop policy is per script, and the baseline stays backward compatible

A script's failure can now be **tolerated** (the workflow records it and continues) or **fatal** (the transition is blocked). The default stays **fatal** — the fail-closed behaviour the platform had before.

The persistence is the interesting part. The baseline's `hooks.nodes.<node>.enter/exit` **stay plain string lists**; the tolerated scripts ride a **new optional `tolerateFailure` list**. An existing `baseline.yml` therefore needs **no migration** and reads exactly as before; a script that is not listed keeps the fail-closed default. The UI wire form is per-entry (`{ path, fatal }`) because a switch belongs to a row, not to a list.

The switch is **ON by default** (fail-closed) and a new script is added fatal, so a customer who never touches it keeps today's behaviour.

A tolerated script must be one of the same node's own scripts — a hand-edited `tolerateFailure` entry that no list names is dead config (the workflow would never reach it). Rather than dropping it silently, the service **reports** it: `validateToleratedHooks` (baf-core) checks the rule, and the standards summary carries the line to the card (`hooksNotice`).

### The hero turns light, and three pages join the family

The 确认门 and 变更总览 heroes were **gold plates**: a dark gold slab, a 26% wash, a heavy drop shadow. They now share one register:

- a **hairline** edge (13% gold over the standard line) instead of a gold frame,
- a **single 4.5% gold wash** that fades out by the middle, over the surface,
- a **lift** instead of a drop shadow,
- the BAF mark as a **light gold chip** (11% gold fill, 24% gold edge) instead of a dark gold block.

测试流, 指令集 and 企业规范 now open the same way: a **page header** (brand chip + eyebrow + title + description) and a row of **three figure plates**. The two client packages do not share a component — `ui-baf-workflow` and `ui-settings-baf-standard` would have to depend on each other — so each package implements its own; the visual language is held together by the shared `--wf-*` CSS token family.

### 变更总览: the board reaches a browser, and the ledger becomes readable

- **「在浏览器中打开」 was broken on desktop**: the desktop shell's window-open handler forwards only http(s)/file URLs, so the `blob:` page never left the renderer. The shell now exposes `shell:openHtml` — it writes the board to a temp file and opens **that**; a browser keeps the Blob URL.
- The **label is white**. White on the old 62% gold was 3.4:1, so the fill deepens (`color-mix(--wf-accent 44%→32%, #241a08)`) and the white label keeps 6.6:1 … 8.5:1.
- The loading view is a **spinning ring in a plate**, not a bare line of text — a slow projection round read as a frozen page.
- The record list gains **four view controls**: category (all / active / completed / abandoned), workflow mode, sort (default / duration / tasks / id) and a **search on the change id**. The filters narrow first, the sort reorders what survived; `default` keeps the host's own order (the projection reads newest change first, and no client-side guess reproduces that for rows without a timestamp).

## Alternatives considered

- **Give the switch its own baseline block (`hooks.nodes.<node>.fatal`)** — rejected: it would rewrite every existing baseline's hook lists, and the wire form would need a parallel structure. An optional `tolerateFailure` list is additive, and "not listed" already means "fatal".
- **Share one hero component between the two client packages** — rejected: a client package may not import another client package's internals, and the dependency would put two plugin bundles into one module graph. The visual contract is the `--wf-*` token family, not a shared module.
- **Make the 变更总览 toolbar a modal or a separate page** — rejected: the customer asked for the card list to be filterable; the ledger is already the page.
- **Keep the dark hero and only soften the brand chip** — rejected: the darkness came from the plate itself (the wash, the border, the shadow), not from the chip.

## Testing

- `npx vitest run packages/baf/baf-core/tests/baseline-edit.spec.ts packages/baf/baf-workflow/tests/node-hooks.spec.ts packages/client/ui-settings-baf-standard/tests/standards-config-service.spec.ts packages/client/ui-settings-baf-standard/tests/standards-overview.client.spec.tsx` — **145 cases green**. New cases: the tolerated script is written to `tolerateFailure`; a tolerated script the node does not configure is rejected (both in the baf-core draft validator and through the summary's `hooksNotice`); a tolerated failure does not stop the workflow (`node-hooks.spec.ts` drives the pipeline past it and asserts the change advanced).
- **Web walkthrough** (`overlay/scripts/probe-batch28-web.mjs`, headless Edge on CDP 9200 at 1680×1050 against the dev host) — **all assertions PASS, `fail: []`**. It measures, on the real page:
  - the **top gap of all seven tabs** (one value: 14px) and the **content column's cap** (1180px, no 760px cap left);
  - the **gold coverage of both heroes** (a 4.5% wash, a hairline edge, a light brand chip) and the three new **page headers** (brand chip + eyebrow + title + description, three figure plates each);
  - the three **project card heads** (glyph, title, description) and the **状态进出hook** rename;
  - the **失败中止 switch**: the probe adds a script through the editor, reads the switch (present, labelled 「失败中止 · <path>」, ON by default), flips it off, saves, and then reads `baseline.yml` from disk to confirm the `tolerateFailure` list — then removes the script again and confirms the file is back to its original state;
  - the **loading plate** (a spinner with a running animation) and the **white label** on 「在浏览器中打开」, and that the button hands a `blob:` board to the browser;
  - the **view controls**: four categories, five sorts, four mode filters, a search box, the category filter narrowing the list, the sort reordering it, and the search reporting the no-match state.
- Screenshots: `overlay/scripts/out/batch28-web-*.png` (one per tab, one per new header, the hooks switch, the ledger).
- **Desktop walkthrough** (`overlay/scripts/probe-batch28-exe.mjs`, the packaged `baf-dsh.exe` on CDP 9222) — **all assertions PASS, `fail: []`, `skipped: []`**: the packaged version marker reads **0.0.52**; the renderer runs the desktop bridge (`window.bafDesktop.isDesktop === true`, `openHtml` present); the `shell:openHtml` handler is registered and refuses an empty page **before** it writes a file or asks the browser to open anything; the seven tabs keep one top gap (14px) and the column still caps at 1180px; both heroes carry the 4.5% wash and the light brand chip; the three new page headers each show three figure plates; and the ledger's 「在浏览器中打开」 **does not** take the `blob:` path on desktop — it hands the board to the shell, which writes `%TEMP%\baf-dsh\baf-dsh-change-overview.html` (9167 bytes, a complete page carrying the ledger) and opens it, with no error notice on the page.
- The packaging guard `npm run verify-desktop-dir-launch` passed (`ok -> …/desktop/.smoke-launch-ok`): the packed `dsh web` reached its ready URL and the exe shell smoke added no failure record.

## Consequences

- The 工作流 page's seven tabs now open at **one** spacing, and its content column is **1180px** wide instead of 960px (with the inner 760px cap gone).
- 确认门 and 变更总览's headers are **light**; 测试流, 指令集 and 企业规范 gained the same header band and a three-plate figure row. Five pages of the surface now read as one family.
- 项目工程's three cards carry a glyph, a title and a one-line description; 「状态脚本」 is 「状态进出hook」.
- Every enter/exit script carries a **「失败中止」 switch**. OFF means "this script's failure is tolerated" and writes the script into `baseline.yml`'s `tolerateFailure` list; ON (the default) keeps the transition blocked. Scripts run in the order they were configured.
- The baseline's `enter` / `exit` lists are **unchanged** — a customer's existing file needs no migration, and a hand-edited dead `tolerateFailure` entry is now reported instead of dropped.
- 变更总览's 「在浏览器中打开」 works on desktop again (the shell writes a temp file and opens it), its label is white, the loading view spins, and the record list can be filtered, sorted and searched.
- The desktop version moved to **0.0.52** (`overlay/desktop/VERSION`, `overlay/desktop/package.json`, `overlay/desktop/version-notes.json` with both language notes, and a new row in `overlay/docs/release/version-map.md`).
