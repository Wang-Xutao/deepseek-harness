# BAF plugin pack

Hot-updated payload for baf-dsh. Layout:

```text
agent-presets/<id>/   # synced into ~/.dsh/.agent-presets/<id> (use baf- prefix)
skills/<name>/        # synced into ~/.dsh/skills/<name>
plugins/              # reserved
workflows/            # reserved
standards/            # reserved
plugin-manifest.json
```

Version is `plugin-manifest.json` → `version` (`bafPlugin`).
