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
    // 【变更】2026-10-21 (批次八 3.3): the audit found baf-standard's Python
    // standards skill was never migrated — shipped byte-exact and cataloged so
    // the 企业规范 chart no longer misses a whole language's standard.
    id: 'python',
    titleZh: 'SORA Python 工具/脚本编码规范',
    titleEn: 'Python coding standards',
    rel: 'skills/sora-python-code-standards/SKILL.md',
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
  | {
    readonly status: 'ready'
    /** The matched catalog row (standards or quality — ids are disjoint). */
    readonly entry: EnterpriseDocEntry | QualityDocEntry
    readonly path: string
    readonly content: string
  }
  | { readonly status: 'unknown' }
  | { readonly status: 'unreadable'; readonly reason: string }

/**
 * 【变更】2026-10-20 (批次七 2.5): the 质量监控 tab's REAL baf-quality assets —
 * environment setup (templates README), configuration (project.yml /
 * config.json / CPPLINT.cfg / suppressions), and the toolchain's own skill
 * docs. Rendered as grouped rows by the client mirror; the three STANDARDS
 * skills themselves stay cataloged in {@link ENTERPRISE_DOCS} (ids `static` /
 * `ut` / `utlist`) and the quality UI re-uses those ids instead of duplicating
 * entries here, so an id resolves in exactly one catalog.
 */
export type QualityDocGroup = 'env' | 'config' | 'ut'

/** One cataloged quality-toolchain document. */
export interface QualityDocEntry {
  /** Stable doc id (`env-ut` / `cfg-project` / …). */
  readonly id: string
  /** Chinese title. */
  readonly titleZh: string
  /** English title. */
  readonly titleEn: string
  /** Posix path under `assets/enterprise`. */
  readonly rel: string
  /** Presentation group (环境搭建 / 配置). */
  readonly group: QualityDocGroup
}

/** The quality catalog — presentation order is the group order. */
export const QUALITY_DOCS: readonly QualityDocEntry[] = [
  {
    id: 'env-ut',
    titleZh: 'C 单元测试工程说明（Ceedling）',
    titleEn: 'UT project guide (Ceedling)',
    rel: 'quality/ceedling/README.md',
    group: 'env',
  },
  {
    id: 'env-static',
    titleZh: '静态分析入仓资产说明（cpplint + cppcheck）',
    titleEn: 'Static-analysis assets guide',
    rel: 'quality/static-analysis/README.md',
    group: 'env',
  },
  {
    id: 'cfg-project',
    titleZh: 'Ceedling 工程配置 project.yml',
    titleEn: 'Ceedling project.yml',
    rel: 'quality/ceedling/project.yml',
    group: 'config',
  },
  {
    id: 'cfg-config',
    titleZh: '质量门配置 config.json',
    titleEn: 'Quality gate config.json',
    rel: 'quality/ceedling/config.json',
    group: 'config',
  },
  {
    id: 'cfg-cpplint',
    titleZh: 'CPPLINT.cfg（SORA 风格定制）',
    titleEn: 'CPPLINT.cfg (SORA style)',
    rel: 'quality/static-analysis/CPPLINT.cfg',
    group: 'config',
  },
  {
    id: 'cfg-cppcheck',
    titleZh: 'cppcheck 抑制文件',
    titleEn: 'cppcheck suppressions',
    rel: 'quality/static-analysis/cppcheck-suppressions.xml',
    group: 'config',
  },
  {
    // 【变更】2026-10-21 (批次八 3.4): the UT module template — gen-ut scaffolds
    // new test files from it; the 质量监控 UT card catalogs it so the template
    // is previewable/openable like every other real asset (group `ut` is
    // rendered by the UT card, not the toolchain card's env/config groups).
    id: 'uttpl',
    titleZh: '单元测试模块模板 test_module.template.c',
    titleEn: 'UT module template',
    rel: 'quality/ceedling/test/test_module.template.c',
    group: 'ut',
  },
]

/**
 * Read one cataloged document's full text from the package assets (the
 * standards catalog first, then the quality catalog — ids are disjoint).
 * @param id - catalog id.
 * @returns ready with the absolute path + content, unknown for an uncataloged
 * id, unreadable with the IO reason.
 */
export function readEnterpriseDoc(id: string): EnterpriseDocRead {
  const entry = ENTERPRISE_DOCS.find(doc => doc.id === id)
    ?? QUALITY_DOCS.find(doc => doc.id === id)
  if (entry === undefined) return { status: 'unknown' }
  const path = join(enterpriseAssetsRoot(), ...entry.rel.split('/'))
  try {
    return { status: 'ready', entry, path, content: readFileSync(path, 'utf8') }
  } catch (error) {
    return { status: 'unreadable', reason: error instanceof Error ? error.message : String(error) }
  }
}
