# Agent Note: Batch 38 (2026-10-30) — the timer only counts work, the gate buttons sit together, the scope waits for the file list, and the channel moved to GitLab

Status: implemented

## Problem

The customer filed eight changes against the BAF DSH desktop app (2026-10-30) and added a ninth request about the release channel:

1. The 变更分类 card carried a paragraph explaining 「置信度是系统对『该走哪条路径』的把握…」 — delete it.
2. The workflow graph's top 会话耗时 did not refresh every second; a gate wait must not count, the model's own running time must.
3. The confirmation gate's 「确认」 and 「暂不推进」 buttons sat at the two far ends of the card — left-align them, and check every other gate for the same defect.
4. The stage artifact's 「已完成」 chip should read 「已锁定」.
5. An approval popup kept asking to compare demo6 with the SIBLING workspace — why does the workflow keep touching other workspaces?
6. The right side's 会话耗时 must refresh every second too.
7. No 等待审批 may count toward the duration; the top label 「会话耗时」 becomes 「流程耗时」.
8. The 变更分类 impact scope shows 「跨模块」 although no file has been touched — is that the default? The hover should list the modified file names.
9. The baf-dsh.exe version and upgrade were triggered by GitHub Releases; they move to GitLab Releases — confirm what has to change.

## Decision

### One per-second clock, and only work counts

The client had one interpolation anchor inside `WorkflowView`; the right rail and the graph read the host's frozen value. All three now read ONE hook — `packages/client/ui-baf-workflow/src/client/live-duration.ts` — which advances the host's value once a second and freezes whenever the host says the change is not running (`metrics.running === false`).

The host's fold learned a second customer-decision window next to the confirmation gate: the APPROVAL wait. The session log records `approval/asked` → `approval/decided`; the gap between them is the time the customer spent deciding, and the fold subtracts it from the stage durations (`metrics.ts`, `deriveWorkflowMetrics(events, nowMs, usagePoints, approvalWaits)`). A pending ask also freezes the clock — the model is blocked on a human, exactly like at a gate.

A dangling ask (asked, never decided — an interrupted session, a dismissed card) counts only while it is recent: `PENDING_APPROVAL_WINDOW_MS` (30 min). The demo6 session carried FOUR such asks, and before the window existed they froze the change's clock for good.

### The gate buttons sit together

`BafGateComposer.module.css` gave the option buttons `flex: 1 1 140px`, so two buttons stretched to the two ends of a 1368 px card. The row is now `justify-content: flex-start` and the buttons `flex: 0 0 auto` — the measured gap on the live app is 8 px. The other gate surfaces were checked: the workflow page's own gate card (`.actions`) and the 确认门 ledger already size their options by content.

### The scope waits for the file list

The keyword layer used the REWORK group (重构 / 迁移 / 改造 …) to set 「跨模块」 — a kind signal read as a blast radius, on a card where no file existed yet. Now only the customer's own breadth words set the scope; everything else stays 待定 until the plan freezes the file allowlist and `deriveScopeFromAllowlist` settles it by MODULE ROOT. The model no longer judges the scope either (it reads a requirement text, not the code base). `reviewIntake` no longer sends a new requirement into the clarification branch merely because its scope is unsettled — only a DEFECT depends on the scope (the fast path needs a small blast radius).

### The workflow stays inside its workspace

The demo6 session went looking for ecum's callers in the neighbouring `demo` workspace — every such probe became an approval popup. The boundary is now written where the model reads it: the dispatch work order (`go-dispatch.ts`), the `baf-go` skill (hard rule 11), and the workspace's own default rules document (scaffold template). A fact outside the workspace is a QUESTION for the customer, not a read.

### The update channel moved to GitLab Releases

The desktop updater read GitHub Releases (`api.github.com/repos/<owner>/<repo>/releases/tags/<tag>`). It now reads GitLab Releases on the self-hosted GitLab: `https://gitlab.sinc.lan/api/v4/projects/ai%2Fworkflow%2Fbaf-dsh/releases/<tag>` — the project is public, so no token travels with the client, and the manifest signature stays the only trust anchor.

GitLab has no "uploaded asset" on a release: it carries LINKS. So `overlay/desktop/src/update/github.ts` became `gitlab.ts` (`GitlabUpdateConfig` = host + project + channel tag; the assets are `assets.links`, downloaded by their `url` / `direct_asset_url`). The fault-code vocabulary (U-01…U-04) is unchanged, so the customer-facing card and the help table still read the same.

The publishing side is NOT migrated (the customer owns it): `overlay/scripts/publish-release.mjs` and `.github/workflows/baf-dsh-release.yml` still publish to GitHub and now say so in their header. What the GitLab side must produce is written down in `overlay/docs/engineering/build.md` (「发版（GitLab Releases）」): the version release `baf-dsh-vX.Y.Z` and the channel release `baf-channel-stable`, with the artifacts attached as release links whose NAMES match the manifest's artifact names.

## Verification

- `pnpm exec tsc -b tsconfig.json` — 0 errors; `npx tsc -p overlay/desktop/tsconfig.json --noEmit` — 0 errors.
- `vitest run packages/baf/baf-workflow/tests packages/client/ui-baf-workflow/tests` — 66 files / 759 tests green (new: the approval-wait exclusion, the pending-freeze, the dangling-ask window, the rework scope, the 已锁定 chip).
- `npm --prefix overlay/desktop test` — 16 files / 108 tests green (the updater's release double now serves the GitLab shape).
- `pnpm run build:artifacts` — 8 gates green.
- Web (headless Edge over CDP, demo6 workspace, real session 「重构 ecum」): the top strip reads 流程耗时 and ticks (65m57s → 65m59s over 2.2 s); the right rail's 会话耗时 ticks (65m41s → 65m43s); the 阶段产物 rail reads 已锁定 (proposal.md / clarify.md) with no 已完成 chip; the classification card has no 置信度是系统对… paragraph; the live gate card's buttons measure 8 px apart with `justify-content: flex-start`.
- Desktop: `overlay/desktop/dist/win-unpacked/baf-dsh.exe` (0.0.60, no installer) — `npm run dist:dir` runs the packaged real-launch smoke (`verify-desktop-dir-launch`) as its last step.
