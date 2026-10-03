---
description: "BAF featured-plugins service: curated external bundle install, update, enable, and auto-update over the profile plugin manager."
kind: "package-reference"
---

# @deepseek-ai/dsh-baf-featured

English | [中文](README.zh.md)

## Summary

`dsh-baf-featured` turns one curated `featured-plugins.json` document into a managed set of external bundles. It reads the manifest fresh on every call (a hot-updated manifest needs no service restart), joins each entry with the profile's installed bundles through `@deepseek-ai/dsh-plugin-manager`, and exposes install, update, enable/disable, removal, bulk operations, and opt-in auto-update as one remote service (`ctx.featuredPlugins`).

Without a plugin manager every card degrades to read-only `unavailable`; the service never blocks a boot on one.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## Use this package

The desktop shell exports the manifest path through `BAF_DSH_FEATURED_MANIFEST`; the service is mounted by the web bundle and reached over Typert Gateway:

```ts
const listing = await ctx.remote.featuredPlugins.list()
await ctx.remote.featuredPlugins.install('dsh-feishu')
// A refusal the person must confirm:
if (!result.ok && result.needsRiskAck) {
  await ctx.remote.featuredPlugins.install('dsh-feishu', { acceptRisk: true })
}
```

An update is a direct install of the same curated range — the manager's inspect-time already-installed refusal only guards prechecks, not this path. `setAutoUpdate` persists the person's override beside the dsh home; the scheduled check reinstalls only entries that are enabled, opted in, and offer a version still inside the curated range.

<a id="understand-the-implementation"></a>
## Understand the implementation

- `manifest.ts` validates the curated document strictly (schemaVersion, integer revision, per-entry required fields, duplicate ids) and reports problems without throwing.
- `registry.ts` compares versions, decides whether a registry answer sits inside a curated `^`-range, and looks up `<pkg>/latest` against npmmirror then npmjs, bounded at 10 s per registry.
- `state.ts` persists auto-update overrides and cached latest versions to `~/.dsh/featured-state.json` through `writeFileAtomic`, forgiving unreadable content into defaults.
- `service.ts` joins manifest × bundles × state, folds manager `ChangeResult`s (compatibility refusals become `needsRiskAck` confirmations; held build scripts pass through as `pendingBuilds`), grants accepted exemptions through `setVersionExemption` then retries once, and drives the auto-update timer with unref'd Node timers cleared on dispose.

<a id="known-limitations-and-deferred-work"></a>
## Known Limitations and Deferred Work

- Version checks do not consult the profile's pnpm; they trust the registry `latest` documents. A registry serving stale metadata shows a stale `latestKnown` until the next check.
- Auto-update never accepts risk or approves build scripts on its own: an entry whose update trips the compatibility gate or pnpm's build hold waits for a person in the settings section.
- `rangeSatisfies` covers exact pins and `^` ranges on three-part versions — the shapes the curated manifest pins; other range syntax is treated as an exact pin.
