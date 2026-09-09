# @deepseek-ai/dsh-client-ui-settings-updates

English | [中文](README.zh.md)

Desktop-oriented settings section that shows baf-dsh / open-source dsh / BAF plugin pack versions and drives check/update through `window.bafDesktop`. Outside Electron it only explains that updates require the desktop app.

No runtime invariant companion is published because version facts and update state are owned by the desktop shell; this section only renders them.

## Model Experience

None, as the section renders a browser configuration UI; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Updates require the Electron bridge** — without `window.bafDesktop` the page is informational only.
- **Toolchain versions are deferred** — this surface does not list external toolchain versions yet.
- **Private GitHub token / signature verification are deferred** — public release channel only for now.
