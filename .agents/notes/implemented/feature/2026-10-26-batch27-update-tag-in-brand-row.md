# Agent Note: Batch 27 (2026-10-26) — the update tag moves to the sidebar's brand row, next to the version it would replace

Status: implemented

## Problem

The update tag that appeared while an update was pending sat at the **end of the 设置 button** at the sidebar foot. The user asked for it to move to the **top of the sidebar, right of the version capsule** — the place where the app already says which version it is.

The two locations are not interchangeable, and the difference matters:

- The version capsule is a *fact about the running build*. The tag is a *fact about a newer build*. Reading them on one line turns the tag from "somewhere in the footer, maybe about the app" into "this version can be upgraded".
- The footer is crowded: the Settings trigger, the connection indicator and the update status all share that row. A loud chip there competes with three other things and sits far from the version it refers to.
- The brand row has exactly one free seat — and it is not free by accident. The brand itself is a `<button>` (clicking the wordmark starts a New Session), so anything interactive that wants to sit beside it has to live **outside** that button.

## Decision

### The brand row grew a trailing seat: `sidebar.brand.trailing`

`ui-sidebar` declares the seat (`packages/client/ui-sidebar/src/client/contract/slots.ts`) and renders it inside a new **brand group**:

```
.logoRow (justify-content: flex-end)
├── .brandRow (flex: 1)          ← the group
│   ├── .brand (flex: 0 1 auto)  ← the wordmark; a button when session/create is allowed
│   └── slot: sidebar.brand.trailing
└── the collapse toggle
```

Two things had to change for the tag to land *next to* the capsule rather than at the row's far edge:

- **The group.** The trailing seat renders inside `.brandRow`, a wrapper that now takes the free width the brand used to take. The brand itself drops from `flex: 1` to `flex: 0 1 auto`, so it sizes to its content and yields space to the seat. The collapse toggle stays at the row's far edge, exactly where it was.
- **The button.** The seat is a **sibling** of the brand, never a child. One button may not nest another, and the brand is a New Session shortcut. The seat renders in the expanded column only, so the collapsed rail keeps no occupant — the same rule the old placement had.

`ui-sidebar` owns the seat because it owns the brand row; the declaration lives in the `sidebar` registration's `children` and is rendered by `SidebarRoot`.

### The tag itself did not move packages — only its seat

The chip stays in **`ui-settings-general`**: the 8-language dictionary (`update.tag` / `update.tagHint`), the danger-tinted styles and the `useBafUpdateAvailable` hook all stay where they are. Only the rendering position changed, from the Settings trigger row to the brand-row seat.

That keeps three properties the alternative would have broken:

- **No cross-plugin value import.** The tag reaches the sidebar through a slot, not through a module import — the client bundle purity gate stays satisfied.
- **No i18n regression.** The dictionary never left the package, so the copy is still translated in all eight languages instead of collapsing to zh/en.
- **One source for the fact.** The tag reads the same `useBafUpdateAvailable` signal the settings panel's red dot reads.

### The tag opens 版本与更新 through the shell's own store

The chip calls `actions.openSection('version-updates')` on the settings shell store. That store is declared once per shell and shared: `ui-settings-general` now hands the **same** store handle to both registrations (the `sidebar.settings` occupant and the `sidebar.brand.trailing` occupant), so the chip selects the section and the panel reads the selection from one instance. The chip is registered inside the same `remoteAccess.whenAccess('settings/describe', …)` gate as the shell itself — without the panel there is nothing for the chip to open.

### The Settings trigger row keeps its group

The `.triggerGroup` wrapper was introduced last batch to keep the tag at the button's end rather than letting it drift to the row's edge. With the tag gone, the group still earns its place: it holds the row's free width, so a **third-party launcher** registered into `settings.launcher` cannot squeeze the connection indicator and the update status out of the row's end.

### The brand row does not have room for a chip with a glyph

The first build put the chip — icon and label — right of the capsule, and the packaged build showed the truth: the version capsule was cut to `v0.0.5`. The sidebar's content column is 256px wide at its 280px default (the shell pads it by 12px on each side), and the row also carries the 28px collapse toggle. The wordmark (90px), the mark (24px), the version capsule (45px) and the chip (58px) do not fit together with their gutters — the chip pushed the capsule out of the brand's clipped box.

Three changes make the row hold together:

- **The wordmark yields, the capsule does not.** The BAF wordmark's name span shrinks with an ellipsis and the version capsule keeps its width (`flex: none`). Before, the brand box clipped whatever hung past its right edge — which was the capsule, the one thing the tag talks about.
- **The chip carries its label only.** The download glyph beside a version capsule says nothing the version does not already say, and it cost 16px of a 256px row. The chip is a danger-tinted 「更新」 pill.
- **The brand group's gutter drops to 6px**, which is the gap between the brand and the chip — a badge next to a wordmark does not need the row's 8px rhythm.

The result at the default width: the wordmark is whole, the capsule is whole, and the chip sits between the capsule and the toggle's empty space. Narrower than the default the wordmark ellipsizes first — the brand yields, the two facts do not.

## Alternatives considered

- **Put the tag inside the `sidebar.brand.name` slot.** Rejected: that slot renders the wordmark, and the wordmark lives inside `.brandIdentity`, which carries `aria-hidden="true"` — a chip there would be invisible to assistive technology. It is also inside the brand's own button.
- **Move the tag to `ui-baf-desktop` (which owns the version capsule).** Rejected: the chip opens the Settings panel, so it needs the settings shell's store. A cross-plugin store would need a service; the tag's dictionary, styles and update fact already live in `ui-settings-general`, so the move would have traded one coupling for another.
- **Reuse the existing `sidebar.toggle.badge` seat.** Rejected: that seat is explicitly non-interactive (it renders the collapsed rail's expand-button status), and it lives in the collapsed rail, not the expanded brand row.
- **Keep the chip in the footer and add a second chip in the brand row.** Rejected: two chips for one fact. The footer red dot inside the panel already carries the news when the panel is open.
- **Render the trailing seat in the row instead of the group.** Rejected: `.logoRow` is `justify-content: flex-end` with the brand at `flex: 1`, so a seat in the row would sit at the far edge, next to the collapse toggle — the opposite of what was asked.

## Testing

- `npm run typecheck` — 5 gates green (Host Typert, host compiler, client compiler, host aggregate check, client aggregate check).
- `npm run build:artifacts` — 8 gates green (native addon, Host Typert, host compiler, Host bundle, Desktop bundle, client compiler, Client bundle, Web build).
- `npx vitest run packages/client/ui-sidebar/tests` — 75 cases green, 3 snapshots updated. The new case pins the seat's geometry: the occupant is **not** inside the brand button (`trailing.closest('button')` is null), it shares the brand's group (`trailing.parentElement === brand.parentElement`), and it follows the brand in document order.
- `npx vitest run packages/client/ui-settings-general/tests` — 105 cases green, including the new `sidebar-update-tag.client.spec.tsx` (4 cases: no chip while the shell reports no update, no chip outside the desktop shell, the localized chip opens 版本与更新 through the store, and the English label). One pre-existing failure remains in `settings-root.client.spec.tsx` ("shows the effective settings binding on focus…") — the Tooltip is disabled in the wide layout, and the untouched tree fails the same way.
- `npx vitest run packages/client/ui-settings-general/tests/apply.client.spec.ts` — 11 cases green on the assembled web client: the brand-row seat's occupant is this package's tag, it declares the `settings` namespace, and it leaves with the plugin.
- `pnpm run gen-client-catalog` — the generated client slot catalog carries the new seat, its occupant and its owner props.
- `pnpm run verify-translation-pairing --write` for the two changed packages; the pairing check reports the pairs as consistent.
- **Update-prompt walkthrough** (`overlay/scripts/verify-update-prompt.mjs`, three variants, each against a local mock GitHub API, against the rebuilt `overlay/desktop` shell) — **optional 20 + forced 18 + apply 11 assertions, all PASS, `fail: []`, `skipped: []`**. The probe now measures the brand row instead of guessing at it: the chip's box, the version capsule's box, the wordmark's box, the row's box and the collapse toggle's box. The geometry it pins down is the one the user asked for — the chip sits **right of the capsule** (chip left 183, capsule right 177, 6px apart), the **wordmark is whole** (`scrollWidth <= clientWidth`; the capsule never takes the clip), and the chip stays in the brand row, **left of the collapse toggle** (chip right 221, toggle left 240). The *apply* variant still lands a real update: the mock serves `manifest.json` → `baf-plugin-0.0.3.zip`, the shell downloads it, verifies the sha256, unpacks it and swaps the plugin directory, so the live plugin reads **0.0.3** and the old directory survives as `.bak`. The operating system's message box is raised **0 times** in all three variants.

## Consequences

- The update tag now sits at the top of the sidebar, immediately right of the `v0.0.51` capsule, and the version the user could upgrade to is on the same line as the version they are running.
- `ui-sidebar` declares a new root-scoped seat, `sidebar.brand.trailing`. A deployment can put its own badge there without replacing the brand; the seat renders only in the expanded column.
- The brand row's DOM changed: the brand now sits inside a `.brandRow` group, and `.brand` renders at content width instead of filling the row. The collapse toggle keeps its position at the row's far edge.
- The tag's component moved to `packages/client/ui-settings-general/src/client/SidebarUpdateTag.tsx` with its own CSS module; the styles left `SettingsRoot.module.css`. The chip lost its download glyph: the brand row is 256px wide and the glyph cost 16px it could not spare — the words do the work next to a version capsule.
- The BAF wordmark now ellipsizes instead of letting the brand box clip whatever hung past its right edge, and the version capsule never shrinks. The brand yields; the two facts do not.
- The update tag is registered into a slot owned by another package, so it is now disposed with the settings plugin rather than with the settings shell registration alone.
- The desktop version moved to **0.0.51** (`overlay/desktop/VERSION`, `overlay/desktop/package.json`, `overlay/desktop/version-notes.json` with both language notes, and a new row in `overlay/docs/release/version-map.md`).
