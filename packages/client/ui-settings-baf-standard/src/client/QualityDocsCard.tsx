/**
 * 【变更】2026-10-20 (批次七 2.5): the 质量监控 tab's REAL baf-quality
 * toolchain — grouped rows over the migrated package assets (环境搭建 /
 * 配置 from `QUALITY_DOC_ROWS`; the toolchain's own standards SKILLs re-use
 * the enterprise catalog ids), each opening the document's full text in the
 * SHARED right-hand viewer pane (like opening a file). Replaces the static
 * gate-mechanism placeholder card.
 */
import type { StandardsOverviewFace, StandardsOverviewState } from './standards-store.ts'
import type { StandardsPanelProps } from './StandardsOverview.tsx'
import { EnterpriseDocViewer, viewerOf } from './EnterpriseDocViewer.tsx'
import { NODE_LABEL_KEYS } from './EnterpriseDocsCard.tsx'
import { ENTERPRISE_DOC_ROWS, QUALITY_DOC_ROWS } from './enterprise-docs-catalog.ts'
import css from './StandardsOverview.module.css'

/** Join CSS-module names without a clsx dependency (filters dropped keys). */
const join = (...names: ReadonlyArray<string | undefined>): string =>
  names.filter((name): name is string => name !== undefined && name !== '').join(' ')

/** The standards SKILLs the quality toolchain owns (enterprise catalog ids). */
const STANDARD_DOC_IDS: readonly string[] = ['static', 'ut', 'utlist']

/** One toolchain document row — title (zh + en) + optional meta line. */
function QualityRow({ id, titleZh, titleEn, meta, selected, onOpen }: {
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

/** The quality toolchain card — grouped real-asset rows + shared viewer pane. */
export function QualityDocsCard({ state, t, openEnterpriseDoc, closeEnterpriseDoc, openPath }: {
  state: StandardsOverviewState
  t: StandardsPanelProps['t']
  openEnterpriseDoc: StandardsOverviewFace['openEnterpriseDoc']
  closeEnterpriseDoc: StandardsOverviewFace['closeEnterpriseDoc']
  openPath: StandardsOverviewFace['openPath']
}) {
  const openId = state.enterpriseDocId
  const viewer = viewerOf(openId, state.enterpriseDoc)

  // Group presentation: 环境搭建 → 配置 → 规范文档 (the standards rows borrow
  // the enterprise catalog's display fields so titles can never drift).
  const groups = [
    {
      key: 'env',
      label: t('qualityGroupEnv'),
      rows: QUALITY_DOC_ROWS.filter(row => row.group === 'env').map(row => ({
        id: row.id,
        titleZh: row.titleZh,
        titleEn: row.titleEn,
        meta: 'baf-quality · templates',
      })),
    },
    {
      key: 'config',
      label: t('qualityGroupConfig'),
      rows: QUALITY_DOC_ROWS.filter(row => row.group === 'config').map(row => ({
        id: row.id,
        titleZh: row.titleZh,
        titleEn: row.titleEn,
        meta: 'baf-quality · templates',
      })),
    },
    {
      key: 'standard',
      label: t('qualityGroupStandard'),
      rows: ENTERPRISE_DOC_ROWS
        .filter(row => STANDARD_DOC_IDS.includes(row.id))
        .map(row => ({
          id: row.id,
          titleZh: row.titleZh,
          titleEn: row.titleEn,
          meta: `${t('enterpriseDocApplies')}${row.nodes.map(node => t(NODE_LABEL_KEYS[node])).join(' / ')}`,
        })),
    },
  ]

  return (
    <div className={css.card} data-testid="baf-quality-docs-card">
      <div className={css.cardTitle}>{t('qualityToolchainTitle')}</div>
      <div className={css.qualitySplit}>
        <div className={css.qualityGroups}>
          {groups.map(group => (
            <div key={group.key} className={css.qualityGroup} data-testid={`baf-quality-group-${group.key}`}>
              <div className={css.qualityGroupLabel}>{group.label}</div>
              <div className={css.docList}>
                {group.rows.map(row => (
                  <QualityRow
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
          <div className={css.docHint}>{t('qualityDocsPick')}</div>
        </div>
        {viewer !== undefined ? (
          <EnterpriseDocViewer
            viewer={viewer}
            t={t}
            onOpenFile={(path) => { void openPath(path) }}
            onClose={() => { closeEnterpriseDoc() }}
          />
        ) : null}
      </div>
    </div>
  )
}
