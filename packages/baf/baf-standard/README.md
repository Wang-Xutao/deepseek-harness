# @deepseek-ai/dsh-baf-standard

BAF standard baseline provider (Phase 7.2). It projects the `standard` section of a validated
baseline into a structured rule-area summary for three consumers:

English | [中文](README.zh.md)

- **Prompt injection** — `renderPrompt(baseline)` returns a short block that points the model at the
  enterprise rules source instead of inlining rules.
- **Plan validation** — `hasStandardArea(summary, id)` checks area ids against the stable catalog.
- **Guard reference** — area ids are the stable vocabulary used in guard/verify messages.

## Design rules

- **No embedded rule values.** The provider carries only the baseline's `standard.mattPocockRulesRef`
  plus a fixed catalog of rule-area ids. Rule content lives in the referenced enterprise source.
- **Placeholder means policy missing.** A `<enterprise-tbd>` reference yields
  `availability: 'policy_missing'` with reason code `policy_missing`; the provider never substitutes
  default rules (enterprise-workflow §15).

## Usage

```ts
import { summarizeStandard, renderStandardPrompt } from '@deepseek-ai/dsh-baf-standard'

const baseline = await ctx.bafCore.loadBaseline('baseline.yml')
const summary = summarizeStandard(baseline)
const promptBlock = renderStandardPrompt(summary)
```

As a Cordis service (`bafStandard` in the BAF domain isolate) the same calls are available as
`ctx.bafStandard.summary(baseline)` and `ctx.bafStandard.renderPrompt(baseline)`.
