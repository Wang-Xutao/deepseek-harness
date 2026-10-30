# Agent Note: Batch 39 (2026-10-30) — the gate options share one row, the advance button keeps its slot, the scope follows the files, and GitLab gets a one-command test update

Status: implemented

## Problem

The customer came back with four points (2026-10-30, after batch 38):

1. The confirmation gate's option buttons must ALL sit on one line — three options folded onto a second row and read as two groups.
2. 「按键过宽」 was not about the gate buttons at all: it is the buttons at the top of the workflow graph page. And it is not a MISSING button — it is an EMPTY BUTTON SLOT that has to be filled in.
3. How does a GitLab release trigger a test update?
4. The 变更分类's 影响范围 moves between 确认状态 and 摘要, and its logic becomes: default 待确定; as the workflow advances and files change, the files go into the hover; all files in ONE directory → 模块内, files in DIFFERENT directories → 跨模块; the change detail must show every file the hover lists.

## Decision

### One row of gate options

`BafGateComposer.module.css`: the option row is `flex-wrap: nowrap` and the buttons share the width (`flex: 1 1 0; min-width: 0`). A long label or hint wraps INSIDE its button instead of pushing the row to a second line. Measured on the live app: three options, one row, 8 px gaps.

### The empty slot in the graph toolbar

The toolbar holds 「推进」 + 「暂停/继续」, and the 推进 button was rendered ONLY while `advance.ready` was true — so on a change that cannot advance yet the toolbar showed a single button with an empty place beside it, which the customer read as a missing button. The button now KEEPS ITS PLACE: always rendered, `disabled` when the advance is not legal, with the host's `advance.missing` lines as its title (the same reasons the Tab's 推进 tooltip shows). The toolbar reads 推进 | 暂停 at all times.

### The scope follows the FILES

The scope was a keyword pre-judgment (and, since batch 38, a 「待计划阶段确认」 promise). It is now read from the FILES the change has touched:

- the host computes the union of the plan ledger's frozen `allowlist` and its `touched` set (`readScopeFiles` in `baf-workflow/src/tab-view.ts`), filters the workflow's own documents out, and attaches `scope: { files, kind }` to the view;
- the derivation (`deriveScopeFromFiles` in `baf-workflow/src/intake.ts`) counts MODULE ROOTS: no product file → 待确定; one root → 模块内; several roots → 跨模块. The old rule counted FILES (one file → 单文件), which the customer's wording replaces;
- the card row moved between 确认状态 and 摘要, its hover lists EVERY file, and the change detail prints the whole list under the row (`change-detail-scope-files`).

The keyword layer still refuses to pre-judge the scope (batch 38), so a change that has not touched a file reads 待确定 — which is exactly what the customer asked for.

### One command for a GitLab test update

`overlay/scripts/publish-release-gitlab.mjs` (`npm run publish-release-gitlab`) publishes what the updater reads: it uploads the artifacts to the project's GENERIC PACKAGE registry (`PUT /projects/:id/packages/generic/baf-dsh/<version>/<file>` — the project is public, so the download URL needs no token) and attaches one release LINK per artifact, then creates (or refreshes) the version release `baf-dsh-v<version>` and the channel release `baf-channel-stable`. The link NAME must equal the artifact name the manifest carries — the updater looks artifacts up by name.

`overlay/docs/engineering/build.md` gained the step-by-step (build-release → dry-run → publish with `GITLAB_TOKEN`), the fault codes, and the two rules that bite (link names, channel refresh).

## Verification

- `pnpm exec tsc -b tsconfig.json` — 0 errors.
- `vitest run packages/baf/baf-workflow/tests packages/client/ui-baf-workflow/tests` — 66 files / 761 tests green (new: the directory-based scope rule, the 待确定 default, the disabled-but-present advance button, the change detail's file list).
- `pnpm run build:artifacts` — 8 gates green.
- Web (headless Edge over CDP, demo6): the toolbar carries 推进 (disabled, with the missing reason on its title) + 暂停; the 变更分类 card reads 模式 → 类型 → 初判置信度 → 确认状态 → 影响范围「待确定」→ 摘要; a live 确认门 card measures three options on ONE row (`rowCount === btnCount`, `flex-wrap: nowrap`, `justify-content: flex-start`).
- Desktop: `overlay/desktop/dist/win-unpacked/baf-dsh.exe` (0.0.61, no installer) — `npm run dist:dir` runs the packaged real-launch smoke as its last step.
