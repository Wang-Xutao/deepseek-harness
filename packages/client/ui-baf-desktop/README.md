# @deepseek-ai/dsh-client-ui-baf-desktop

English | [中文](README.zh.md)

Desktop chrome for baf-dsh: monochrome Sora mark after the empty-hero headline, optional VS Code / Cursor open buttons in the session header, and a Help footer action with a MkDocs documentation placeholder panel.

## Model Experience

None, as the package only contributes browser chrome; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **IDE buttons require the Electron bridge** — without `window.bafDesktop.getIdeTools` the header utilities stay empty.
- **Help docs are a placeholder** — MkDocs content is not shipped yet.
