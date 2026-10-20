/**
 * 【变更】2026-10-20 (批次六 5): the REAL enterprise standard documents shipped
 * in `assets/enterprise` (migrated from bafplugin) — a product-constant
 * catalog the 企业规范 tab renders as a workflow flow chart (which standard
 * applies at which state) plus an on-demand reader for the document text.
 * The constitution TODO templates are deliberately NOT cataloged (they are
 * placeholders, not standards — the 批次六 5 customer decision: 不再使用占位符).
 * @module @deepseek-ai/dsh-baf-standard/enterprise-docs
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { enterpriseAssetsRoot } from './apply-enterprise-standards.ts'

/** One cataloged enterprise standard document. */
export interface EnterpriseDocEntry {
  /** Stable doc id (`overview` / `code` / `sri` / …). */
  readonly id: string
  /** Chinese title (the document's own heading, shortened for the UI). */
  readonly titleZh: string
  /** English title. */
  readonly titleEn: string
  /** Posix path under `assets/enterprise`. */
  readonly rel: string
  /** Workflow node ids where the standard applies (the canvas marking). */
  readonly nodes: readonly string[]
}

/**
 * The catalog — order is presentation order. Titles are concise UI labels
 * DERIVED from each document's own `# ` heading (some shortened — e.g.
 * `（Agent 短规则）` tails dropped); the viewer shows the document verbatim,
 * so its first line may carry the fuller heading.
 */
export const ENTERPRISE_DOCS: readonly EnterpriseDocEntry[] = [
  {
    id: 'overview',
    titleZh: 'baf-standard 概览',
    titleEn: 'Standards overview',
    rel: 'skills/sora-standards-overview/SKILL.md',
    nodes: ['intake'],
  },
  {
    id: 'docs',
    titleZh: 'SORA 文档规范',
    titleEn: 'Documentation standards',
    rel: 'skills/sora-docs-standards/SKILL.md',
    nodes: ['open', 'clarify'],
  },
  {
    id: 'code',
    titleZh: 'SORA C 语言编码规范',
    titleEn: 'C coding standards',
    rel: 'skills/sora-c-code-standards/SKILL.md',
    nodes: ['design', 'implement'],
  },
  {
    id: 'sri',
    titleZh: 'SRI-SPEC-SW-01A Agent 核对表',
    titleEn: 'SRI-SPEC-SW-01A agent checklist',
    rel: 'skills/sora-c-code-standards/references/sri-spec-sw-01a-agent-checklist.md',
    nodes: ['design', 'implement'],
  },
  {
    id: 'risk',
    titleZh: '高风险代码评审清单',
    titleEn: 'High-risk review checklist',
    rel: 'c/high-risk-review-checklist.md',
    nodes: ['design'],
  },
  {
    id: 'branch',
    titleZh: 'SORA 分支与变更命名',
    titleEn: 'Branch & change naming',
    rel: 'skills/sora-branch-standards/SKILL.md',
    nodes: ['plan'],
  },
  {
    id: 'commit',
    titleZh: 'SORA 提交信息规范',
    titleEn: 'Commit message standards',
    rel: 'skills/sora-commit-standards/SKILL.md',
    nodes: ['plan'],
  },
  {
    id: 'static',
    titleZh: '静态分析规范（cpplint + cppcheck）',
    titleEn: 'Static analysis (cpplint + cppcheck)',
    rel: 'skills/sora-c-static-analysis/SKILL.md',
    nodes: ['implement', 'verify'],
  },
  {
    id: 'ut',
    titleZh: 'SORA 单元测试规范（Ceedling）',
    titleEn: 'Unit testing (Ceedling)',
    rel: 'skills/sora-c-ut-ceedling/SKILL.md',
    nodes: ['implement', 'verify'],
  },
  {
    id: 'utlist',
    titleZh: '单元测试核对表',
    titleEn: 'UT checklist',
    rel: 'skills/sora-c-ut-ceedling/references/ut-checklist.md',
    nodes: ['verify'],
  },
]

/** {@link readEnterpriseDoc} outcome. */
export type EnterpriseDocRead =
  | { readonly status: 'ready'; readonly entry: EnterpriseDocEntry; readonly path: string; readonly content: string }
  | { readonly status: 'unknown' }
  | { readonly status: 'unreadable'; readonly reason: string }

/**
 * Read one cataloged document's full text from the package assets.
 * @param id - catalog id.
 * @returns ready with the absolute path + content, unknown for an uncataloged
 * id, unreadable with the IO reason.
 */
export function readEnterpriseDoc(id: string): EnterpriseDocRead {
  const entry = ENTERPRISE_DOCS.find(doc => doc.id === id)
  if (entry === undefined) return { status: 'unknown' }
  const path = join(enterpriseAssetsRoot(), ...entry.rel.split('/'))
  try {
    return { status: 'ready', entry, path, content: readFileSync(path, 'utf8') }
  } catch (error) {
    return { status: 'unreadable', reason: error instanceof Error ? error.message : String(error) }
  }
}
