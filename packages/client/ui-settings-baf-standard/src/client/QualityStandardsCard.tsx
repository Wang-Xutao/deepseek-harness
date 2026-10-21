/**
 * 【变更】2026-10-21 (质量监控重构 1.5): the 质量监控 tab's 规范 card — EVERY
 * unit-test-related standards document from the bafplugin-migrated catalogs,
 * CATEGORIZED (测试纪律 / 静态分析 / 环境搭建 / 配置模板), each opening the
 * document's full text in the shared full-screen viewer. Replaces the old
 * QualityDocsCard's env/config/standard split with the customer's requested
 * UT-focused categorization.
 */
import type { StandardsOverviewFace, StandardsOverviewState } from './standards-store.ts'
import type { StandardsPanelProps } from './StandardsOverview.tsx'
import { NODE_LABEL_KEYS } from './EnterpriseDocsCard.tsx'
import { ENTERPRISE_DOC_ROWS, QUALITY_DOC_ROWS } from './enterprise-docs-catalog.ts'
import css from './StandardsOverview.module.css'

/** Join CSS-module names without a clsx dependency (filters dropped keys). */
const join = (...names: ReadonlyArray<string | undefined>): string =>
  names.filter((name): name is string => name !== undefined && name !== '').join(' ')

/** The standards SKILLs the quality toolchain owns (enterprise catalog ids). */
const UT_STANDARD_IDS: readonly string[] = ['ut', 'utlist']
const STATIC_STANDARD_IDS: readonly string[] = ['static']

/** The 环境搭建 group's asset-template rows (quality catalog ids). */
const ENV_DOC_IDS: readonly string[] = ['env-ut', 'env-static']

/** The 配置模板 group's asset-template rows (quality catalog ids). */
const CONFIG_DOC_IDS: readonly string[] = ['cfg-project', 'cfg-config', 'cfg-cpplint', 'cfg-cppcheck', 'uttpl']

/** One categorized document row — title (zh + en) + optional meta line. */
function DocRow({ id, titleZh, titleEn, meta, selected, onOpen }: {
  id: string
  titleZh: string
  titleEn: string
  meta: string | undefined
  selected: boolean
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      className={join(css.docRow, selected ? css.docRowSelected : undefined)}
      data-testid={`baf-quality-doc-${id}`}
      aria-pressed={selected}
      onClick={onOpen}
    >
      <span className={css.docRowMain}>
        <span className={css.docRowTitle}>{titleZh}</span>
        <span className={css.docRowEn}>{titleEn}</span>
      </span>
      {meta === undefined ? null : (
        <span className={css.docRowMeta}>{meta}</span>
      )}
    </button>
  )
}

/**
 * The 规范 card — every UT-related document, categorized, opening the shared
 * tab-level viewer.
 */
export function QualityStandardsCard({ state, t, openEnterpriseDoc }: {
  state: StandardsOverviewState
  t: StandardsPanelProps['t']
  openEnterpriseDoc: StandardsOverviewFace['openEnterpriseDoc']
}) {
  const openId = state.enterpriseDocId

  // Categorization: the toolchain's standards SKILLs first (they carry the
  // workflow-node applicability meta), then the environment/config templates.
  // The standards rows borrow the enterprise catalog's display fields so
  // titles can never drift from the catalogs.
  const groups: ReadonlyArray<{
    key: string
    label: string
    rows: ReadonlyArray<{ id: string; titleZh: string; titleEn: string; meta?: string }>
  }> = [
    {
      key: 'ut',
      label: t('qolDocGroupUt'),
      rows: ENTERPRISE_DOC_ROWS
        .filter(row => UT_STANDARD_IDS.includes(row.id))
        .map(row => ({
          id: row.id,
          titleZh: row.titleZh,
          titleEn: row.titleEn,
          meta: `${t('enterpriseDocApplies')}${row.nodes.map(node => t(NODE_LABEL_KEYS[node])).join(' / ')}`,
        })),
    },
    {
      key: 'static',
      label: t('qolDocGroupStatic'),
      rows: ENTERPRISE_DOC_ROWS
        .filter(row => STATIC_STANDARD_IDS.includes(row.id))
        .map(row => ({
          id: row.id,
          titleZh: row.titleZh,
          titleEn: row.titleEn,
          meta: `${t('enterpriseDocApplies')}${row.nodes.map(node => t(NODE_LABEL_KEYS[node])).join(' / ')}`,
        })),
    },
    {
      key: 'env',
      label: t('qolDocGroupEnv'),
      rows: QUALITY_DOC_ROWS
        .filter(row => ENV_DOC_IDS.includes(row.id))
        .map(row => ({ id: row.id, titleZh: row.titleZh, titleEn: row.titleEn })),
    },
    {
      key: 'config',
      label: t('qolDocGroupConfig'),
      rows: QUALITY_DOC_ROWS
        .filter(row => CONFIG_DOC_IDS.includes(row.id))
        .map(row => ({ id: row.id, titleZh: row.titleZh, titleEn: row.titleEn })),
    },
  ]

  return (
    <div className={css.card} data-testid="baf-quality-docs-card">
      <div className={css.cardTitle}>{t('qolDocTitle')}</div>
      <div className={css.qualityGroups}>
        {groups.map(group => (
          <div key={group.key} className={css.qualityGroup} data-testid={`baf-quality-group-${group.key}`}>
            <div className={css.qualityGroupLabel}>{group.label}</div>
            <div className={css.docList}>
              {group.rows.map(row => (
                <DocRow
                  key={row.id}
                  id={row.id}
                  titleZh={row.titleZh}
                  titleEn={row.titleEn}
                  meta={row.meta}
                  selected={openId === row.id}
                  onOpen={() => { void openEnterpriseDoc(row.id) }}
                />
              ))}
            </div>
          </div>
        ))}
        <div className={css.docHint}>{t('qolDocPick')}</div>
      </div>
    </div>
  )
}
