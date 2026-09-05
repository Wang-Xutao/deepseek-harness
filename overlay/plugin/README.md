# BAF plugin pack

Hot-updated payload for baf-dsh. Layout:

```text
skills/<name>/        # synced into ~/.dsh/skills/<name>
plugins/              # reserved
workflows/            # reserved
standards/            # baseline fixtures / future managed bundles
plugin-manifest.json
```

Official BAF agent preset is **not** shipped or synced from this pack.
It lives in the dsh shipped root (`@deepseek-ai/dsh-agent-presets` → `presets/baf/`,
`trust: system`) and must never be copied into `~/.dsh/.agent-presets`.

Version is `plugin-manifest.json` → `version` (`bafPlugin`).
