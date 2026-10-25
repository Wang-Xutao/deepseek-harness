# Agent Note: Batch 26 (2026-10-25) — the session tabs stop repeating themselves in a tooltip, the update channel gets explained, and the desktop learns to call the user back

Status: implemented

## Problem

One request carried three items about the baf-dsh desktop build.

1. **Every session tab repeated itself in a hover bubble.** The tab's whole content is its label, so the tooltip said the same word twice. Only the **更多会话视图** button earns a bubble, because it names the View folded away from the strip.
2. **「版本与更新」: how is an update triggered, and does it work?** The user asked for the mechanism, not for a change — the answer had to come from the code and from the live channel.
3. **There was no desktop notification.** When a task finishes, fails, or blocks on an approval, nothing called the user back — and the user has to know whether the app can do this at all before asking for it.

The same day's second round carried four more, all about the update experience:

4. **The release notes were a wall of text.** Only the important changes should show, and each point should stand on its own.
5. **The forced-update prompt was the operating system's message box.** A Windows panel in the middle of an app that draws every other surface itself reads as a stranger; the prompt must speak the product's own design.
6. **Is the optional update actually working?** The user asked for a real test, not a description.
7. **The Settings button must carry the update.** While an update exists, an eye-catching tag at the end of the sidebar's 设置 button opens 版本与更新, where the update can be applied.

## Decision

### 1. A View tab carries no tooltip; the More button keeps its own

`ConversationSession.tsx` wrapped every tab label in a `Tooltip`. The wrapper is gone; the label is a plain `<span>`. The tab's accessible name is unchanged — CSS truncation never reached the accessibility tree, so the full name still reaches a screen reader, and the primary Views' labels (对话 / 轨迹 / 轨迹图 / 工作流图 / 测试流图) are far below the 88px truncation width.

**更多会话视图** keeps its tooltip unchanged: its label is not the tab's content, it names the View the strip no longer shows.

### 2. The update channel — what it is and why nothing arrives today

The mechanism is **fully implemented**; the channel is **not published**.

- **The channel** is a GitHub Release tagged `baf-channel-stable` on `Wang-Xutao/deepseek-harness`, carrying a `manifest.json` asset and its detached signature. `fetchChannelManifest` reads it, verifies the Ed25519 signature over the raw manifest bytes, and refuses a manifest whose `releaseEpoch` was already applied (§11.3).
- **The check** runs in three places. Every launch checks in the background during the splash; when the window is up the result reaches the renderer as an `update:checked` push (the Settings nav red dot and the 版本与更新 card stay fresh without polling) and, if an update exists, a native dialog asks 立即更新 / 稍后更新 (or 立即更新 / 退出 for a required harness installer). The page's own 检查更新 button checks again, and the card's 立即更新 applies.
- **The apply** is per scope: `harness` downloads the NSIS installer and launches it, `runtime` hot-swaps the runtime directory and restarts the dsh child, `plugin` hot-swaps the plugin directory. Each scope keeps a `.bak` and can roll back.
- **The CLI** rides the same engine: `baf update check|apply|rollback` writes `update-request.json`, the main process watches it and answers `update-response.json`.

**Why no update arrives today**: `https://api.github.com/repos/Wang-Xutao/deepseek-harness/releases/tags/baf-channel-stable` answers **404**, so every check fails with **U-01「更新服务尚未就绪」**. The release workflow (`.github/workflows/baf-dsh-release.yml`) creates that channel release as its last step, and it only runs on a `baf-dsh-v*` tag pushed from `baf`. Until such a tag exists, the check cannot succeed. Two follow-ups sit behind that: the shipped signing key is still the **test** key (`BAF_TEST_SIGNING_KEY`, `testOnly: true`), which a packaged build refuses by policy, so the production key must be registered in `overlay/desktop/src/update/public-key.ts` before a real release can be verified.

### 3. Desktop notifications: the renderer reports, the shell decides

**The split.** The renderer is the only party that sees the Session lifecycle, so it reports the event. The **Electron shell owns the decision**: the `desktopNotifications` preference lives in `AppPrefs` and the `notify:desktop` handler drops the event while it is off. The setting therefore has one owner and takes effect without a reload — the General-settings switch writes the pref, and the next event follows the new value.

**The events.** A finished task, a failed task, and a task that waits on the user (a tool approval, a question, a plan review) each raise one toast. The bold line says what happened; the body line names the Session; clicking the toast reveals the window, which is the point of the reminder when the app sits in the tray.

**One turn, one toast.** A stopped turn is not yet a settled outcome: the Agent reports the failure and the running state drops in the same breath, in either order. `DesktopNotificationController` therefore settles a turn once, after a 250ms window, and reports the failure instead of the completion when the failure arrived. Without that window, one failed turn would raise two toasts — or none, depending on which signal arrived first.

**Where the observation happens.** The observer is a `shell.overlay` entry, so it sees every Session in the list — not only the open one — and it renders nothing: the toast belongs to the operating system, not to the page. The failure arrives as the `api-session/error` Remote event, so it does not depend on the observed Session being open.

**The setting's place.** The 桌面通知 row sits in 通用设置 directly above 开机自启动 — the notification is the more urgent of the two desktop behaviours.

### 4. The update prompt is the app's own dialog: the shell decides, the app draws

`dialog.showMessageBox` put a Windows-styled panel in the middle of a product that paints every other surface itself. The split now follows the product's grain: **the shell owns the decision, the renderer owns the drawing.**

- The shell still decides WHEN to prompt (only the splash-time background check prompts; a manual check on the settings page stays on the page) and WHAT the prompt means: which scope prompted, whether the update is required, and what applying it does.
- The shell hands the renderer the facts — the scope summary, the release notes, the target version — over a new `update:prompt` push, and keeps them until the next prompt, so a renderer that mounted late still finds one (`update:getPrompt`).
- The renderer draws the dialog in the frame-wide `shell.overlay` layer (`ui-baf-desktop`'s `UpdatePromptDialog`), on the product's own `Modal` primitive, and answers with the product's own actions. `update:dismissPrompt` tells the shell the user answered, so a reloaded renderer does not raise a dismissed dialog again.

**Two variants, one surface.** An optional update offers 「立即更新」 and 「稍后更新」; the mask, Escape and the close button all dismiss it. A required update (a forced security release, or a minimum shell version above the installed one) says 「必须更新后才能继续使用」, offers 「立即更新」 and 「退出应用」, and **refuses every dismissal path** — no close button, and Escape does nothing. The old version must not keep running. 「退出应用」 needs a new `app:quit` IPC: only the shell can end the process.

**Applying stays the shell's work.** The progress arrives as a push, the outcome arrives in the reply, and a failure keeps the dialog open with the reason so the user can retry — or quit, when the update was required. The shell also learned to step aside once the installer launched (`update:start` now quits), which the native prompt used to own and the settings page's own update never did.

### 5. The notes are paragraphs

`version-notes.json`'s `desktop.notesZh` / `desktop.notesEn` now carry six key points, one per line, and both surfaces split on the line break: the prompt renders them as a bulleted list, and the 版本与更新 card renders them as one paragraph each. The card's own renderer (`UpdatesSection`) grew the split; the dialog does the same.

### 6. The Settings button carries the update

While the baf-dsh shell reports an available update, the sidebar's 设置 trigger grows an eye-catching 「更新」 tag at its end (a danger-tinted chip with a halo, the same tone as the nav red dot). Clicking it opens the settings panel directly on 版本与更新, where the 更新 button applies the update. The fact is the one the nav red dot already reads (`useBafUpdateAvailable`), so there is a single source. The collapsed rail has no room for the word, so the tag stays out of it — the panel's red dot still carries the news.

## Alternatives considered

- **Keep the tab tooltip.** Rejected: the label is the tab's content; the bubble said the same word twice. The More button keeps its tooltip because its label names something the strip does not show.
- **Report the notification event from the Host.** Rejected: the Host is a Node server with no OS-notification capability, and the shell already owns the one channel that works (IPC from the renderer). The Host→main file channel exists for update commands, which are not per-turn events.
- **Let the renderer own the preference.** Rejected: then the switch would need a round-trip before every event, and the pref would live in two places (the shell's `AppPrefs` and the renderer's copy). The shell owns it, so the toggle is immediate.
- **Suppress the toast while the window is focused.** Rejected: the user asked for the notification on these events, and a setting that turns the feature on should show it. Focus-based suppression would have made the feature look broken during a manual check.
- **Report the error from the session-scoped snapshot (`lastAgentError`).** Rejected: that field is only reachable from a session-scope component, so a background Session's failure would be silent. The `api-session/error` Remote event carries the same text for every Session the client can see.
- **Notify once per turn with a generic「任务已结束」.** Rejected: the user named three distinct states, and a failure that reads as a completion is worse than no notification.

## Testing

- `pnpm run typecheck` — 5 gates green (Host Typert, host compiler, client compiler, host aggregate check, client aggregate check).
- `pnpm run build:artifacts` — 8 gates green.
- `npx vitest run --project thread-safe packages/client/ui-baf-desktop/tests/desktop-notification.client.spec.ts` — 7 cases green: a finished turn reports once; an already-idle Session reports nothing; a Session that runs again reports each turn; the failure wins over the completion in **both** arrival orders; a blocking request reports once, when it appears, and again when a different request appears; the display title is remembered; a disposed controller reports nothing.
- `npx vitest run` under `overlay/desktop` — 107 cases green, including the new `notification.spec.ts` (the payload parser refuses an unknown kind, an empty line and a non-object; both lines are trimmed; a long line is shortened) and the updated `prefs.spec.ts` (the notification pref persists as a boolean and merges per row). One pre-existing failure in `ensure-dsh-modules.spec.ts` (tar expansion at a drive-letter path) is untouched by this batch.
- `pnpm run verify-translation-pairing --write` for the three changed packages; the pairing check reports only pre-existing incomplete pairs in other packages.
- `pnpm run verify-client-ui-i18n` — the new copy is dictionary-owned; the reported violations are pre-existing files this batch did not touch.
- **Web walkthrough** (`overlay/scripts/probe-batch26-web.mjs`, headless Edge over CDP, two rounds) — **12 assertions, all PASS, `fail: []`, `skipped: []`**. Round one is the plain web build: the session View strip renders 对话 / 轨迹 / 轨迹图 / 工作流图 / 测试流图, hovering a View tab raises **no** tooltip, hovering **更多会话视图** raises exactly `更多会话视图`, and 设置 → 版本与更新 opens the web page that reads 「检查更新与升级仅在 baf-dsh 桌面应用中可用。」. Round two injects a `window.bafDesktop` stub shaped like the preload: 通用设置 shows the 桌面通知 row (「桌面通知 / 任务完成、出错或需要你审批时，发送系统通知提醒」) **above** 开机自启动, the switch writes `{ desktopNotifications: true }` back through `setPrefs`, the bridge exposes `notify()`, and 版本与更新 switches from the web notice to the desktop page.
- **Desktop walkthrough** (`overlay/scripts/probe-batch26-exe-ui.mjs`, the packaged `baf-dsh.exe` over CDP, re-run against the package rebuilt for this batch's prompt change) — **16 assertions, all PASS, `fail: []`, `skipped: []`**. The packaged marker reads **0.0.50**, the shipped bridge carries `notify()`, the View strip renders 对话 / 轨迹 / 轨迹图 / 工作流图 / 测试流图, hovering a View tab raises **no** tooltip while **更多会话视图** raises exactly `更多会话视图`, 通用设置 shows 桌面通知 **above** 开机自启动, and the pref governs the toast: with it off the shell drops the event (`shown: false`), with it on the shell raises the OS notification (`shown: true`) and the value reaches `desktop-prefs.json`. The packaged 版本与更新 page answers **「检查更新失败：故障码 U-01 · 更新服务尚未就绪」** — the live confirmation of §2's channel diagnosis, taken from the shipped build itself. The packed shell carries `update:prompt` / `update:getPrompt` / `update:dismissPrompt` / `app:quit` and no `showMessageBox`; the packed client bundle carries the prompt component and the condensed notes.
- **Update-prompt walkthrough** (`overlay/scripts/verify-update-prompt.mjs`, three variants, each against a local mock GitHub API) — **17 + 18 + 12 assertions, all PASS, `fail: []`, `skipped: []`**. Two things the probe has to survive, both found by running it twice against the same profile: the settings dialog can **disappear between two reads** while the client is still settling its connection generation (the shell logged `[connection] generation is still not ready after 3000ms`) — so the probe opens 版本与更新 and reads the card in one retry loop, re-opening the panel when it is gone; and the mock channel publishes a **fresh releaseEpoch on every check** (the counter lives in the probe's work directory), because the shell persists the epoch it last applied and refuses a manifest below it — a real channel ships a new manifest whenever it releases, so a mock that re-served one manifest would make a reused profile fail for the wrong reason.
  - *optional* — the check reports `available`, the plan reads 「harness: 桌面 0.0.50 → 0.0.51」, the prompt appears **inside the app** with the headline 「发现新版本」, the six release notes render as six separate paragraphs, the actions are 立即更新 / 稍后更新, 「稍后更新」 closes it, and **the operating system's message box was raised 0 times**. The 设置 button carries a 「更新」 tag **at its end** (its right edge is past the trigger's right edge), the tag opens the settings panel straight onto 版本与更新, that nav row is the active one, the card is there, and the card's own points render one per paragraph.
  - *forced* — the headline reads 「必须更新后才能继续使用」, the actions are 立即更新 / **退出应用**, there is **no close button** (`closeButtons: 0`), **Escape does not dismiss it** (present before and after), and the message box count is still 0. The 设置 tag is present in the same place.
  - *apply* — a real update really lands: the mock serves `manifest.json` → `baf-dsh-v0.0.51` → `baf-plugin-0.0.3.zip`, the shell downloads it, verifies the sha256, unpacks it and swaps the plugin directory, so the live plugin reads **0.0.3** (`versions.json` schema 2 → `plugin.baf: 0.0.3`) and the previous directory survives as `.bak`. The message box count is still 0.
- `npx vitest run --project thread-safe packages/client/ui-baf-desktop/tests/update-prompt.client.spec.tsx` — the prompt payload parser and the controller green.
- `npx vitest run --project thread-safe packages/client/ui-settings-general/tests/settings-root.client.spec.tsx` — the 「更新」 tag opens 版本与更新 green. One pre-existing failure in this file ("shows the effective settings binding on focus…") also fails on the untouched tree — the Tooltip is disabled in the wide layout.
- `npm run build:check` — 2 gates green (host aggregate check, client aggregate check).

## Consequences

- The session tab strip is quieter: hovering a tab shows nothing, while hovering **更多会话视图** still names the folded View.
- The desktop now raises an operating-system toast for the three states that need the user. The pref defaults to **off**, so an existing installation stays quiet until the user turns it on in 通用设置 → 桌面通知.
- `AppPrefs` grew a `desktopNotifications` field. The persisted document, the `prefs:get` / `prefs:set` IPC shape and the settings rows all carry it; a document without the field reads as off.
- `window.bafDesktop` grew a `notify` method. A browser build and a desktop shell older than this feature simply have no bridge, so the client raises nothing.
- The update prompt is now drawn by the app instead of by the operating system. The shell still decides (when, whether required, how to apply); the renderer paints. That split is what lets a required update refuse every dismissal path — no close button, no Escape, no mask — and lets an optional one be closed, in the product's own design.
- The shell gained four IPCs for this: `update:prompt` (push the facts), `update:getPrompt` (a renderer that mounted late still finds one), `update:dismissPrompt` (the user answered; do not raise it again) and `app:quit` (only the shell may end the process). The preload exposes them as `onUpdatePrompt` / `getUpdatePrompt` / `dismissUpdatePrompt` / `quitApp`.
- `update:start` now quits the app once the installer has launched. The installer replaces files that are in use, so the shell has to step aside; the settings page's own 更新 button used to leave the process running over its own replacement.
- The release notes are six points, one per line, in `version-notes.json`. Both surfaces split on that line break — the prompt renders a bulleted list, the 版本与更新 card renders one paragraph each.
- The sidebar's 设置 trigger grew a sibling 「更新」 tag rather than a child: an interactive element inside a button is invalid HTML, and the tag has its own click behaviour (open 版本与更新). It is a separate `<button>`, so it shows only in the wide layout — the collapsed rail has no room for the word, and the panel's red dot carries the news there.
- `ui-baf-desktop` now depends on `@deepseek-ai/dsh-client-ui-session` and `@deepseek-ai/dsh-api-session-controller` (type-only) for the Session status hooks and the forwarded failure event.
- The update-notice probe lives at `overlay/scripts/verify-update-prompt.mjs` (with `overlay/scripts/verify-update-prompt-fetch.cjs`) and is wired as `npm run verify-update-prompt` in `overlay/`. It is named `verify-*` rather than `probe-*` on purpose: `overlay/.gitignore` keeps `scripts/probe-*` on disk only, so a probe meant to be a resident regression check has to carry the name the repository tracks.
- The update channel still needs a `baf-dsh-v*` tag on `baf` **and** a registered production signing key before a packaged build can accept a published manifest. Until then the check reports U-01, not a silent no-op.
- The desktop version moved to **0.0.50** (`overlay/desktop/VERSION`, `overlay/desktop/package.json`, `overlay/desktop/version-notes.json` with both language notes, and a new row in `overlay/docs/release/version-map.md`). The packaged build in `overlay/desktop/dist/win-unpacked/baf-dsh.exe` was produced with `electron-builder --dir` (no installer).
