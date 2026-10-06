# baf-baseline-c fixture

Phase 0 example enterprise baseline for local C stacks. All concrete tool and threshold fields are `<enterprise-tbd>`.

Copied for unit tests at `packages/baf/baf-core/tests/fixtures/baseline/baseline.yml` (the two copies must stay identical — `overlay/scripts/verify-baf-baseline-fixture.mjs` checks). Production values come from the enterprise freeze in `overlay/docs/baf/enterprise-inputs.md`.

`standard.mattPocockRulesRef` stays the enterprise placeholder HERE on purpose: this fixture models what an enterprise ships. The product-default story (2026-10-06) lives in the scaffold — `/baf-scaffold` lays down `.baf/standards/default-rules.md` and points a fresh workspace's baseline at it, so customer workspaces are effective out-of-the-box; an enterprise replaces the whole policy by re-pointing the ref.
