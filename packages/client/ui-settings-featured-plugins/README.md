# @deepseek-ai/dsh-client-ui-settings-featured-plugins

English | [中文](README.zh.md)

The「精选插件」(Featured plugins) settings section for baf-dsh: curated open-source dsh plugins as cards with per-state actions (install / update / enable / disable / remove), bulk actions, per-plugin auto-update, and the two confirmations the Host's gates ask for (peer-compatibility risk, held build scripts). All facts and operations ride the `featuredPlugins` Remote; the Host re-reports changes through `featured-plugins/changed`.

No runtime invariant companion is published because curation and install state are owned by the Host service (`@deepseek-ai/dsh-baf-featured`); this section only renders and forwards.

## Model Experience

None, as the section renders a browser configuration UI; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Install progress is phase-level** — the page shows the Host's install phases, not per-byte or per-package download progress.
- **No cancel button** — a started install runs to completion; cancellation stays on the advanced Plugins page.
- **Bulk auto-update is a client-side loop** — one Remote call per entry, not one Host transaction.
