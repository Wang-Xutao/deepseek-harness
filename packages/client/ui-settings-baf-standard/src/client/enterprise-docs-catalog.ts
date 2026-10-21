/**
 * 【变更】2026-10-20 (批次六 5): the BROWSER-side mirror of the enterprise
 * docs catalog (host source of truth: baf-standard's `ENTERPRISE_DOCS`).
 * The host package reads `node:fs`, so its catalog cannot ride the web
 * bundle — this constant duplicates ONLY the display fields (id / titles /
 * shorts / nodes); a client spec asserts parity against the host list so the
 * two can never drift. Shorts are the canvas card's chip tags.
 * @module @deepseek-ai/dsh-client-ui-settings-baf-standard/client
 */

/** Main-chain node ids the catalog marks (WORKFLOW_NODES minus drift). */
export type EnterpriseDocNode =
  | 'intake' | 'open' | 'clarify' | 'design' | 'plan'
  | 'implement' | 'verify' | 'archive'

/** One mirrored document (display fields only — no path, no IO). */
export interface EnterpriseDocRow {
  readonly id: string
  readonly titleZh: string
  readonly titleEn: string
  /** Canvas chip tag, zh locale. */
  readonly shortZh: string
  /** Canvas chip tag, en locale. */
  readonly shortEn: string
  readonly nodes: readonly EnterpriseDocNode[]
}

/** The mirror, in the host catalog's presentation order. */
export const ENTERPRISE_DOC_ROWS: readonly EnterpriseDocRow[] = [
  {
    id: 'overview',
    titleZh: 'baf-standard 概览',
    titleEn: 'Standards overview',
    shortZh: '总览',
    shortEn: 'Overview',
    nodes: ['intake'],
  },
  {
    id: 'docs',
    titleZh: 'SORA 文档规范',
    titleEn: 'Documentation standards',
    shortZh: '文档',
    shortEn: 'Docs',
    nodes: ['open', 'clarify'],
  },
  {
    id: 'code',
    titleZh: 'SORA C 语言编码规范',
    titleEn: 'C coding standards',
    shortZh: '编码',
    shortEn: 'Coding',
    nodes: ['design', 'implement'],
  },
  {
    id: 'sri',
    titleZh: 'SRI-SPEC-SW-01A Agent 核对表',
    titleEn: 'SRI-SPEC-SW-01A agent checklist',
    shortZh: 'SRI',
    shortEn: 'SRI',
    nodes: ['design', 'implement'],
  },
  {
    // 批次八 3.3: migrated with the audit fix (see host catalog).
    id: 'python',
    titleZh: 'SORA Python 工具/脚本编码规范',
    titleEn: 'Python coding standards',
    shortZh: 'Python',
    shortEn: 'Python',
    nodes: ['design', 'implement'],
  },
  {
    id: 'risk',
    titleZh: '高风险代码评审清单',
    titleEn: 'High-risk review checklist',
    shortZh: '高风险',
    shortEn: 'High-risk',
    nodes: ['design'],
  },
  {
    id: 'branch',
    titleZh: 'SORA 分支与变更命名',
    titleEn: 'Branch & change naming',
    shortZh: '分支',
    shortEn: 'Branch',
    nodes: ['plan'],
  },
  {
    id: 'commit',
    titleZh: 'SORA 提交信息规范',
    titleEn: 'Commit message standards',
    shortZh: '提交',
    shortEn: 'Commit',
    nodes: ['plan'],
  },
  {
    id: 'static',
    titleZh: '静态分析规范（cpplint + cppcheck）',
    titleEn: 'Static analysis (cpplint + cppcheck)',
    shortZh: '静态',
    shortEn: 'Static',
    nodes: ['implement', 'verify'],
  },
  {
    id: 'ut',
    titleZh: 'SORA 单元测试规范（Ceedling）',
    titleEn: 'Unit testing (Ceedling)',
    shortZh: 'UT',
    shortEn: 'UT',
    nodes: ['implement', 'verify'],
  },
  {
    id: 'utlist',
    titleZh: '单元测试核对表',
    titleEn: 'UT checklist',
    shortZh: 'UT 表',
    shortEn: 'UT list',
    nodes: ['verify'],
  },
]

/**
 * 【变更】2026-10-20 (批次七 2.5): the 质量监控 tab's REAL baf-quality assets —
 * environment setup + configuration files (host source of truth:
 * baf-standard's `QUALITY_DOCS`). The three standards SKILLs themselves stay
 * in ENTERPRISE_DOC_ROWS and the quality UI references those ids, so an id
 * resolves in exactly one catalog.
 */
export type QualityDocGroup = 'env' | 'config' | 'ut'

/** One mirrored quality document (display fields only — no path, no IO). */
export interface QualityDocRow {
  readonly id: string
  readonly titleZh: string
  readonly titleEn: string
  readonly group: QualityDocGroup
}

/** The quality mirror, in the host catalog's presentation order. */
export const QUALITY_DOC_ROWS: readonly QualityDocRow[] = [
  {
    id: 'env-ut',
    titleZh: 'C 单元测试工程说明（Ceedling）',
    titleEn: 'UT project guide (Ceedling)',
    group: 'env',
  },
  {
    id: 'env-static',
    titleZh: '静态分析入仓资产说明（cpplint + cppcheck）',
    titleEn: 'Static-analysis assets guide',
    group: 'env',
  },
  {
    id: 'cfg-project',
    titleZh: 'Ceedling 工程配置 project.yml',
    titleEn: 'Ceedling project.yml',
    group: 'config',
  },
  {
    id: 'cfg-config',
    titleZh: '质量门配置 config.json',
    titleEn: 'Quality gate config.json',
    group: 'config',
  },
  {
    id: 'cfg-cpplint',
    titleZh: 'CPPLINT.cfg（SORA 风格定制）',
    titleEn: 'CPPLINT.cfg (SORA style)',
    group: 'config',
  },
  {
    id: 'cfg-cppcheck',
    titleZh: 'cppcheck 抑制文件',
    titleEn: 'cppcheck suppressions',
    group: 'config',
  },
  {
    id: 'uttpl',
    titleZh: '单元测试模块模板 test_module.template.c',
    titleEn: 'UT module template',
    group: 'ut',
  },
]
