/**
 * Curated keyword-rule presets for the 多模型路由 settings section: one pack
 * per task class, words gathered from routing practice and the mainstream
 * complexity heuristics (architecture/refactor/security → strong model,
 * tests/review → balanced, docs/wording → light). Bilingual word lists — a
 * customer's task summary may be written in either language and matching is
 * per-word, so one library serves both locales. Client-side constants only:
 * adding a preset is just addKeyword, so the bundle stays free of baf-core
 * value imports (purity gate).
 * @module @deepseek-ai/dsh-client-ui-settings-baf-route/client/presets
 */

import type { RouteTier } from '../types.ts'

/** One curated pack; the display name is the `preset${Id}` locale key. */
export type KeywordPresetId =
  | 'complexEngineering'
  | 'criticalRelease'
  | 'qualityAssurance'
  | 'routineEdits'

/** A one-click keyword pack offered in the settings section. */
export interface KeywordPreset {
  readonly id: KeywordPresetId
  readonly tier: RouteTier
  readonly words: string
}

/** The preset library, high first (escalation order). */
export const KEYWORD_PRESETS: readonly KeywordPreset[] = [
  {
    id: 'complexEngineering',
    tier: 'high',
    words: '架构|重构|性能优化|性能瓶颈|安全漏洞|并发|算法|数据迁移|兼容性|architecture|refactor|performance|security|concurrency|migration',
  },
  {
    id: 'criticalRelease',
    tier: 'high',
    words: '技术选型|方案设计|设计评审|整体方案|上线|发布|部署|breaking',
  },
  {
    id: 'qualityAssurance',
    tier: 'mid',
    words: '单元测试|集成测试|测试用例|代码评审|回归|排查|复现|日志|边界|test|review|debug|regression',
  },
  {
    id: 'routineEdits',
    tier: 'low',
    words: '文案|注释|文档|README|格式化|拼写|错别字|翻译|改名|版本号|typo|wording|docs|rename',
  },
]
