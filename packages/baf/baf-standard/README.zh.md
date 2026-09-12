# @deepseek-ai/dsh-baf-standard

BAF 标准基线提供者（Phase 7.2）。将已校验 baseline 的 `standard` 段投影为结构化规则域摘要，服务三类消费方：

[English](README.md) | 中文

- **Prompt 注入** — `renderPrompt(baseline)` 返回简短文本块，把模型指向企业规则源，而不是内联规则内容。
- **Plan 校验** — `hasStandardArea(summary, id)` 按稳定目录核对规则域 id。
- **Guard 引用** — 规则域 id 是 guard/verify 消息使用的稳定词汇。

## 设计约束

- **不内嵌规则值。** 提供者只携带 baseline 的 `standard.mattPocockRulesRef` 与固定的规则域 id 目录；规则内容由引用的企业规则源定义。
- **占位符即策略缺失。** `<enterprise-tbd>` 引用会得到 `availability: 'policy_missing'` 与 reason code `policy_missing`；提供者绝不回退到默认规则（enterprise-workflow §15）。

## 用法

```ts
import { summarizeStandard, renderStandardPrompt } from '@deepseek-ai/dsh-baf-standard'

const baseline = await ctx.bafCore.loadBaseline('baseline.yml')
const summary = summarizeStandard(baseline)
const promptBlock = renderStandardPrompt(summary)
```

作为 Cordis 服务（BAF domain isolate 中的 `bafStandard`），同样的调用可用
`ctx.bafStandard.summary(baseline)` 与 `ctx.bafStandard.renderPrompt(baseline)`。
